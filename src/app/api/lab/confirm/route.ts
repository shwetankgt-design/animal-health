import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateLine } from "@/lib/validation/engine";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "LAB_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { lineId, additionalConfirmed } = await req.json();
  const line = await prisma.submissionLine.findUnique({ where: { id: lineId } });
  if (!line) return NextResponse.json({ error: "not found" }, { status: 404 });

  const newLabConfirmed = line.labConfirmed + Number(additionalConfirmed);
  if (newLabConfirmed > line.probableCases + line.labConfirmed) {
    return NextResponse.json({ error: "Lab confirmed count cannot exceed the probable pool available." }, { status: 400 });
  }

  const result = validateLine(
    {
      probableCases: line.probableCases,
      labConfirmed: newLabConfirmed,
      deathsToday: line.deathsToday,
      cumulativeCases: line.cumulativeCases,
      activeCases: line.activeCases,
      cumulativeDeaths: line.cumulativeDeaths,
      recoveredCumulative: line.recoveredCumulative,
    },
    {}
  );

  if (result.status === "REJECTED") {
    return NextResponse.json({ error: "Update would violate validation rules.", issues: result.issues }, { status: 400 });
  }

  const updated = await prisma.submissionLine.update({
    where: { id: lineId },
    data: { labConfirmed: newLabConfirmed, totalCasesToday: result.normalized!.totalCasesToday },
  });

  await prisma.auditLog.create({
    data: {
      submissionId: line.submissionId,
      entityType: "SubmissionLine",
      entityId: line.id,
      action: "UPDATE",
      fieldChanges: JSON.stringify({ labConfirmed: { old: line.labConfirmed, new: newLabConfirmed } }),
      reason: "Lab confirmation update",
      actorUserId: session.user.id,
    },
  });

  return NextResponse.json({ line: updated });
}
