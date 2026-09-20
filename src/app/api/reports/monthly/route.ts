import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["DAHD_ADMIN", "DAHD_ANALYST"].includes(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month")) || new Date().getUTCMonth() + 1;
  const year = Number(searchParams.get("year")) || new Date().getUTCFullYear();

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  const lines = await prisma.submissionLine.findMany({
    where: { submission: { reportDate: { gte: start, lte: end } } },
    include: { disease: true, submission: { include: { state: true } }, speciesLinks: { include: { species: true } } },
  });

  type Agg = {
    diseaseName: string;
    stateName: string;
    newCases: number;
    deaths: number;
    speciesSet: Set<string>;
    controlMeasures: Set<string>;
  };
  const map = new Map<string, Agg>();
  for (const l of lines) {
    const key = `${l.disease.name}::${l.submission.state.name}`;
    if (!map.has(key)) {
      map.set(key, {
        diseaseName: l.disease.name,
        stateName: l.submission.state.name,
        newCases: 0,
        deaths: 0,
        speciesSet: new Set(),
        controlMeasures: new Set(),
      });
    }
    const agg = map.get(key)!;
    agg.newCases += l.totalCasesToday;
    agg.deaths += l.deathsToday;
    l.speciesLinks.forEach((s) => agg.speciesSet.add(s.species.name));
    if (l.controlMeasures) agg.controlMeasures.add(l.controlMeasures);
  }

  const format = searchParams.get("format");
  const rows = Array.from(map.values());

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Monthly Situation Report");
    sheet.addRow([`National Animal Disease Monthly Situation Report — ${month}/${year}`]);
    sheet.addRow([]);
    sheet.addRow(["Disease", "State/UT", "New Cases", "Deaths", "Species Affected", "Control Measures"]);
    rows.forEach((r) =>
      sheet.addRow([
        r.diseaseName,
        r.stateName,
        r.newCases,
        r.deaths,
        Array.from(r.speciesSet).join(", "),
        Array.from(r.controlMeasures).join("; "),
      ])
    );
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="MSR_${year}_${month}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await renderPdf(month, year, rows);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MSR_${year}_${month}.pdf"`,
      },
    });
  }

  return NextResponse.json({ month, year, rows: rows.map((r) => ({ ...r, speciesSet: Array.from(r.speciesSet), controlMeasures: Array.from(r.controlMeasures) })) });
}

interface AggRow {
  diseaseName: string;
  stateName: string;
  newCases: number;
  deaths: number;
  speciesSet: Set<string>;
  controlMeasures: Set<string>;
}

function renderPdf(month: number, year: number, rows: AggRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const totalCases = rows.reduce((a, r) => a + r.newCases, 0);
    const totalDeaths = rows.reduce((a, r) => a + r.deaths, 0);
    const diseasesAffected = new Set(rows.map((r) => r.diseaseName)).size;
    const statesAffected = new Set(rows.map((r) => r.stateName)).size;

    doc.fontSize(8).fillColor("#6b6478").text("Government of India · Department of Animal Husbandry & Dairying", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(16).fillColor("#492e6c").font("Helvetica-Bold").text("National Animal Disease Monthly Situation Report", { align: "center" });
    doc.fontSize(11).fillColor("#1c1230").font("Helvetica").text(`${MONTH_NAMES[month - 1]} ${year}`, { align: "center" });
    doc.moveDown(1);

    doc.fontSize(9).fillColor("#1c1230").font("Helvetica-Bold");
    const summaryY = doc.y;
    const cols = [
      { label: "Total new cases", value: String(totalCases) },
      { label: "Total deaths", value: String(totalDeaths) },
      { label: "Diseases reported", value: String(diseasesAffected) },
      { label: "States/UTs affected", value: String(statesAffected) },
    ];
    const colWidth = 128;
    cols.forEach((c, i) => {
      const x = 40 + i * colWidth;
      doc.fontSize(14).fillColor("#ff7900").text(c.value, x, summaryY, { width: colWidth - 10 });
      doc.fontSize(8).fillColor("#6b6478").text(c.label, x, summaryY + 20, { width: colWidth - 10 });
    });
    doc.y = summaryY + 45;
    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    const widths = [90, 90, 55, 50, 100, 130];
    const headers = ["Disease", "State/UT", "New cases", "Deaths", "Species affected", "Control measures"];
    let x = 40;
    doc.fontSize(8).font("Helvetica-Bold").fillColor("white");
    doc.rect(40, tableTop, widths.reduce((a, w) => a + w, 0), 18).fill("#2e1c47");
    headers.forEach((h, i) => {
      doc.fillColor("white").text(h, x + 3, tableTop + 5, { width: widths[i] - 6 });
      x += widths[i];
    });

    let y = tableTop + 18;
    doc.font("Helvetica").fontSize(7.5);
    rows.forEach((r, idx) => {
      const rowHeight = 16;
      if (y + rowHeight > 780) {
        doc.addPage();
        y = 40;
      }
      if (idx % 2 === 1) {
        doc.rect(40, y, widths.reduce((a, w) => a + w, 0), rowHeight).fill("#f5f4f8");
      }
      x = 40;
      const cells = [
        r.diseaseName,
        r.stateName,
        String(r.newCases),
        String(r.deaths),
        Array.from(r.speciesSet).join(", "),
        Array.from(r.controlMeasures).join("; "),
      ];
      cells.forEach((c, i) => {
        doc.fillColor("#1c1230").text(c || "—", x + 3, y + 4, { width: widths[i] - 6, height: rowHeight - 2, ellipsis: true });
        x += widths[i];
      });
      y += rowHeight;
    });

    if (rows.length === 0) {
      doc.fillColor("#6b6478").text("No data for this month.", 40, y + 10);
    }

    doc.end();
  });
}
