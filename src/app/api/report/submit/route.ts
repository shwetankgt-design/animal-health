import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOrCreateDraftSubmission, lockSubmission } from "@/lib/submissionService";
import { dateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "SDRNO") {
    return NextResponse.json({ error: "only the State Nodal Officer can lock a day's submission" }, { status: 403 });
  }
  const stateId = session.user.stateId;
  if (!stateId) return NextResponse.json({ error: "no state scope" }, { status: 400 });

  const { reportDate } = await req.json();
  const normalizedDate = dateOnly(reportDate);

  const diseaseCount = await prisma.disease.count({ where: { active: true } });
  const submission = await getOrCreateDraftSubmission(stateId, normalizedDate);
  const lineCount = await prisma.submissionLine.count({ where: { submissionId: submission.id } });
  const zero = await prisma.zeroReport.findUnique({
    where: { stateId_reportDate: { stateId, reportDate: normalizedDate } },
  });

  if (lineCount === 0 && !zero) {
    return NextResponse.json(
      { error: "Cannot submit: no disease rows entered and no Nil report declared for today." },
      { status: 400 }
    );
  }
  if (lineCount > 0 && lineCount < diseaseCount) {
    return NextResponse.json(
      {
        error: `Cannot submit: ${diseaseCount - lineCount} of ${diseaseCount} master-list diseases have no row yet. Mark them NIL or fill them in.`,
      },
      { status: 400 }
    );
  }

  const locked = await lockSubmission(submission.id, session.user.id);
  return NextResponse.json({ submission: locked });
}
