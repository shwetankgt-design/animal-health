import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { declareZeroReport, lockSubmission, getOrCreateDraftSubmission } from "@/lib/submissionService";
import { dateOnly } from "@/lib/dates";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["SDRNO", "FIELD_VET"].includes(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const stateId = session.user.stateId;
  if (!stateId) return NextResponse.json({ error: "no state scope" }, { status: 400 });

  const { reportDate } = await req.json();
  const normalizedDate = dateOnly(reportDate);

  await declareZeroReport(stateId, normalizedDate, session.user.id);

  if (session.user.role === "SDRNO") {
    const submission = await getOrCreateDraftSubmission(stateId, normalizedDate);
    await lockSubmission(submission.id, session.user.id);
  }

  return NextResponse.json({ ok: true });
}
