import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DAHD_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { submissionId, reason } = await req.json();
  if (!submissionId || !reason?.trim()) {
    return NextResponse.json({ error: "submissionId and a reason are required" }, { status: 400 });
  }

  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) return NextResponse.json({ error: "submission not found" }, { status: 404 });
  if (submission.status !== "SUBMITTED") {
    return NextResponse.json({ error: "Only a submitted (locked) report can have a correction requested." }, { status: 400 });
  }

  const [correctionRequest] = await prisma.$transaction([
    prisma.correctionRequest.create({
      data: { submissionId, reason: reason.trim(), requestedById: session.user.id },
    }),
    prisma.submission.update({ where: { id: submissionId }, data: { status: "CORRECTION_REQUESTED" } }),
    prisma.auditLog.create({
      data: {
        submissionId,
        entityType: "Submission",
        entityId: submissionId,
        action: "CORRECTION_REQUESTED",
        fieldChanges: JSON.stringify({ status: { old: "SUBMITTED", new: "CORRECTION_REQUESTED" } }),
        reason: reason.trim(),
        actorUserId: session.user.id,
      },
    }),
  ]);

  return NextResponse.json({ correctionRequest });
}
