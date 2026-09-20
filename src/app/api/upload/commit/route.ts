import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateAndSaveLine } from "@/lib/submissionService";
import { dateOnly } from "@/lib/dates";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "SDRNO") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { batchId, reportDate, acknowledgedRowIds } = await req.json();
  const batch = await prisma.uploadBatch.findUnique({ where: { id: batchId }, include: { rows: true } });
  if (!batch || batch.stateId !== session.user.stateId) {
    return NextResponse.json({ error: "batch not found" }, { status: 404 });
  }

  const ackSet = new Set<string>(acknowledgedRowIds ?? []);
  const committed: string[] = [];
  const skipped: string[] = [];

  for (const row of batch.rows) {
    const eligible = row.result === "ACCEPTED" || (row.result === "ACCEPTED_WARNING" && ackSet.has(row.id));
    if (!eligible) {
      skipped.push(row.id);
      continue;
    }
    const mapped = JSON.parse(row.mappedData ?? "{}");
    const raw = JSON.parse(row.rawData ?? "{}");
    if (!mapped.diseaseId) {
      skipped.push(row.id);
      continue;
    }

    await validateAndSaveLine({
      stateId: session.user.stateId!,
      reportDate: dateOnly(reportDate),
      diseaseId: mapped.diseaseId,
      districtId: mapped.districtId ?? null,
      village: raw.village ?? null,
      block: raw.block ?? null,
      speciesIds: mapped.speciesIds ?? [],
      input: { ...raw, isNil: false },
      actorUserId: session.user.id,
      reason: "Committed via bulk upload",
    });

    await prisma.uploadRow.update({ where: { id: row.id }, data: { acknowledged: true } });
    committed.push(row.id);
  }

  await prisma.uploadBatch.update({ where: { id: batch.id }, data: { status: "COMMITTED", committedAt: new Date() } });

  return NextResponse.json({ committed: committed.length, skipped: skipped.length });
}
