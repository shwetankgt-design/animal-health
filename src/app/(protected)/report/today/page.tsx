import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dateOnly, todayDateOnly } from "@/lib/dates";
import TodayReportClient from "./TodayReportClient";

export default async function TodayReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRole(["SDRNO", "FIELD_VET"]);
  const { date } = await searchParams;
  const reportDate = dateOnly(date ?? todayDateOnly());

  const [diseases, species, districts, submission, zero] = await Promise.all([
    prisma.disease.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.species.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    user.stateId ? prisma.district.findMany({ where: { stateId: user.stateId, active: true }, orderBy: { name: "asc" } }) : [],
    user.stateId
      ? prisma.submission.findUnique({
          where: { stateId_reportDate: { stateId: user.stateId, reportDate } },
          include: {
            lines: { include: { speciesLinks: true } },
            correctionRequests: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" } },
          },
        })
      : null,
    user.stateId
      ? prisma.zeroReport.findUnique({ where: { stateId_reportDate: { stateId: user.stateId, reportDate } } })
      : null,
  ]);

  return (
    <TodayReportClient
      reportDateIso={reportDate.toISOString()}
      diseases={diseases}
      species={species}
      districts={districts}
      existingLines={submission?.lines ?? []}
      submissionStatus={submission?.status ?? "DRAFT"}
      isZeroReport={!!zero}
      stateName={user.stateName ?? ""}
      openCorrectionRequests={(submission?.correctionRequests ?? []).map((c) => ({
        id: c.id,
        reason: c.reason,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
