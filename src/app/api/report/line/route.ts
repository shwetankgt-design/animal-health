import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { validateAndSaveLine, getPriorDayCumulative } from "@/lib/submissionService";
import { validateLine } from "@/lib/validation/engine";
import { dateOnly } from "@/lib/dates";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["SDRNO", "FIELD_VET"].includes(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { reportDate, diseaseId, districtId, village, block, speciesIds, input, dryRun, reason } = body;

  const stateId = session.user.stateId;
  if (!stateId) return NextResponse.json({ error: "user has no State/UT scope" }, { status: 400 });

  if (dryRun) {
    const prior = await getPriorDayCumulative(stateId, diseaseId, dateOnly(reportDate));
    const result = validateLine(input, { prior: prior ?? undefined });
    return NextResponse.json({ result, prior });
  }

  const result = await validateAndSaveLine({
    stateId,
    reportDate: dateOnly(reportDate),
    diseaseId,
    districtId,
    village,
    block,
    speciesIds: speciesIds ?? [],
    input,
    actorUserId: session.user.id,
    reason,
  });

  return NextResponse.json({ result });
}
