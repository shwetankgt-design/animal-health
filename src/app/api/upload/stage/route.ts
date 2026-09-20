import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { mapColumns, colLetter, FIELD_DICTIONARY } from "@/lib/uploadMapping";
import { fuzzyMatch, validateLine, LineInput } from "@/lib/validation/engine";
import { getPriorDayCumulative } from "@/lib/submissionService";
import { dateOnly, todayDateOnly } from "@/lib/dates";
import type { Session } from "next-auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "SDRNO") {
    return NextResponse.json({ error: "only the State Nodal Officer can upload" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const reportDateStr = (formData.get("reportDate") as string | null) ?? todayDateOnly().toISOString().slice(0, 10);
  const manualMappingRaw = formData.get("manualMapping") as string | null;
  if (!file) return NextResponse.json({ error: "no file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ error: "workbook has no sheet" }, { status: 400 });

  const headerRowValues = (sheet.getRow(1).values as (string | undefined)[]).slice(1);

  let mapping: Record<string, number>;
  let unmatchedColumns: { index: number; header: string }[] = [];

  if (manualMappingRaw) {
    // Submitter has explicitly assigned columns after a low-confidence auto-detect.
    mapping = JSON.parse(manualMappingRaw);
  } else {
    const auto = mapColumns(headerRowValues);
    if (auto.confidence === "LOW") {
      return NextResponse.json({
        needsManualMapping: true,
        headerRowValues,
        unmatchedColumns: auto.unmatchedColumns,
        detectedMapping: auto.mapping,
        fieldDictionary: Object.keys(FIELD_DICTIONARY),
      });
    }
    mapping = auto.mapping;
    unmatchedColumns = auto.unmatchedColumns;
  }

  const result = await stageRows({
    sheet,
    mapping,
    session,
    reportDateStr,
    fileName: file.name,
  });

  return NextResponse.json({ ...result, mapping, unmatchedColumns });
}

async function stageRows({
  sheet,
  mapping,
  session,
  reportDateStr,
  fileName,
}: {
  sheet: ExcelJS.Worksheet;
  mapping: Record<string, number>;
  session: Session;
  reportDateStr: string;
  fileName: string;
}) {
  const user = session.user!;

  const [states, diseases, speciesList, districts] = await Promise.all([
    prisma.stateUT.findMany({ where: { active: true } }),
    prisma.disease.findMany({ where: { active: true } }),
    prisma.species.findMany({ where: { active: true } }),
    prisma.district.findMany({ where: { active: true, stateId: user.stateId ?? undefined } }),
  ]);

  const batch = await prisma.uploadBatch.create({
    data: { stateId: user.stateId, fileName, uploadedById: user.id, status: "STAGED" },
  });

  const reportDate = dateOnly(reportDateStr);
  const rowResults: Record<string, unknown>[] = [];

  const totalRows = sheet.rowCount;
  for (let r = 2; r <= totalRows; r++) {
    const row = sheet.getRow(r);
    if (!row || row.values === undefined || (Array.isArray(row.values) && row.values.length === 0)) continue;
    const cellVal = (field: string): string | undefined => {
      const idx = mapping[field];
      if (idx === undefined) return undefined;
      const v = row.getCell(idx + 1).value;
      if (v === null || v === undefined) return undefined;
      return typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result) : String(v);
    };
    const cellRefFor = (field: string): string | undefined => {
      const idx = mapping[field];
      if (idx === undefined) return undefined;
      return `${colLetter(idx)}${r}`;
    };

    const stateRaw = cellVal("stateRaw");
    const diseaseRaw = cellVal("diseaseRaw");
    const speciesRaw = cellVal("speciesRaw");

    if (!stateRaw && !diseaseRaw && !cellVal("probableCases") && !cellVal("labConfirmed")) continue;

    const violations: {
      field: string;
      rule: string;
      valueReceived: string;
      expected: string;
      severity: string;
      cellRef?: string;
    }[] = [];
    let uploadNotes: string | undefined;

    let resolvedStateId = user.stateId!;
    if (stateRaw) {
      const { match, suggestions } = fuzzyMatch(stateRaw, states.map((s) => ({ code: s.code, name: s.name })));
      if (match) {
        const m = states.find((s) => s.code === match.code)!;
        if (m.id !== user.stateId) {
          violations.push({
            field: "state",
            rule: "This upload is scoped to your own State/UT. A row naming a different State cannot be committed here.",
            valueReceived: stateRaw,
            expected: user.stateName ?? "your State/UT",
            severity: "BLOCK",
            cellRef: cellRefFor("stateRaw"),
          });
        }
      } else if (suggestions.length > 0) {
        violations.push({
          field: "state",
          rule: `State/UT "${stateRaw}" does not resolve to master data. Did you mean one of: ${suggestions
            .map((s) => s.name)
            .join(", ")}?`,
          valueReceived: stateRaw,
          expected: suggestions.map((s) => s.name).join(" / "),
          severity: "BLOCK",
          cellRef: cellRefFor("stateRaw"),
        });
      }
    }

    let resolvedDiseaseId: string | null = null;
    if (!diseaseRaw) {
      violations.push({
        field: "disease",
        rule: "Disease column is required and must resolve to the master disease list.",
        valueReceived: "(blank)",
        expected: "one of the master-list disease names",
        severity: "BLOCK",
        cellRef: cellRefFor("diseaseRaw"),
      });
    } else {
      const { match, suggestions } = fuzzyMatch(diseaseRaw, diseases.map((d) => ({ code: d.code, name: d.name })));
      if (match) {
        resolvedDiseaseId = diseases.find((d) => d.code === match.code)!.id;
      } else if (suggestions.length > 0) {
        violations.push({
          field: "disease",
          rule: `Disease "${diseaseRaw}" does not resolve to master data. Did you mean: ${suggestions
            .map((s) => s.name)
            .join(", ")}?`,
          valueReceived: diseaseRaw,
          expected: suggestions.map((s) => s.name).join(" / "),
          severity: "BLOCK",
          cellRef: cellRefFor("diseaseRaw"),
        });
      } else {
        uploadNotes = `Unrecognized disease text: "${diseaseRaw}"`;
      }
    }

    const resolvedSpeciesIds: string[] = [];
    if (speciesRaw) {
      const parts = speciesRaw.split(/[,/;]/).map((p) => p.trim()).filter(Boolean);
      const unresolvedSpecies: string[] = [];
      for (const p of parts) {
        const { match } = fuzzyMatch(p, speciesList.map((s) => ({ code: s.code, name: s.name })));
        if (match) resolvedSpeciesIds.push(speciesList.find((s) => s.code === match.code)!.id);
        else unresolvedSpecies.push(p);
      }
      if (unresolvedSpecies.length > 0) {
        uploadNotes = [uploadNotes, `Unrecognized species text: "${unresolvedSpecies.join(", ")}"`].filter(Boolean).join(" | ");
      }
    }

    let resolvedDistrictId: string | null = null;
    const districtRaw = cellVal("districtRaw");
    if (districtRaw) {
      const { match } = fuzzyMatch(districtRaw, districts.map((d) => ({ code: d.id, name: d.name })));
      if (match) resolvedDistrictId = match.code;
    }

    const input: LineInput = {
      probableCases: cellVal("probableCases") ?? "",
      labConfirmed: cellVal("labConfirmed") ?? "",
      deathsToday: cellVal("deathsToday") ?? "",
      cumulativeCases: cellVal("cumulativeCases") ?? "",
      activeCases: cellVal("activeCases") ?? "",
      cumulativeDeaths: cellVal("cumulativeDeaths") ?? "",
      recoveredCumulative: cellVal("recoveredCumulative") ?? "",
      vaccinationCumulative: cellVal("vaccinationCumulative") ?? null,
      culledCount: cellVal("culledCount") ?? null,
      controlMeasures: cellVal("controlMeasures") ?? null,
      remarks: cellVal("remarks") ?? null,
      cellRefs: {
        probableCases: cellRefFor("probableCases"),
        labConfirmed: cellRefFor("labConfirmed"),
        deathsToday: cellRefFor("deathsToday"),
        cumulativeCases: cellRefFor("cumulativeCases"),
        activeCases: cellRefFor("activeCases"),
        cumulativeDeaths: cellRefFor("cumulativeDeaths"),
        recoveredCumulative: cellRefFor("recoveredCumulative"),
      },
    };

    let engineResult: ReturnType<typeof validateLine> | null = null;
    if (resolvedDiseaseId && violations.every((v) => v.severity !== "BLOCK")) {
      const prior = await getPriorDayCumulative(resolvedStateId, resolvedDiseaseId, reportDate);
      engineResult = validateLine(input, { prior: prior ?? undefined });
      violations.push(...(engineResult.issues as unknown as typeof violations));
    }

    const hasBlock = violations.some((v) => v.severity === "BLOCK");
    const hasWarning = violations.some((v) => v.severity === "WARNING");
    const rowResultStatus = hasBlock ? "REJECTED" : hasWarning ? "ACCEPTED_WARNING" : "ACCEPTED";

    const uploadRow = await prisma.uploadRow.create({
      data: {
        batchId: batch.id,
        rowIndex: r,
        cellRef: `A${r}`,
        rawData: JSON.stringify({ stateRaw, diseaseRaw, speciesRaw, districtRaw, ...input }),
        mappedData: JSON.stringify({
          stateId: resolvedStateId,
          diseaseId: resolvedDiseaseId,
          speciesIds: resolvedSpeciesIds,
          districtId: resolvedDistrictId,
          normalized: engineResult?.normalized ?? null,
        }),
        result: rowResultStatus,
        violations: JSON.stringify(violations),
        uploadNotes: uploadNotes ?? null,
      },
    });

    rowResults.push({
      id: uploadRow.id,
      rowIndex: r,
      stateRaw,
      diseaseRaw,
      result: rowResultStatus,
      violations,
      uploadNotes,
    });
  }

  return { batchId: batch.id, rows: rowResults };
}
