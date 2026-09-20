import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { todayDateOnly } from "@/lib/dates";
import LabClient from "./LabClient";

export default async function LabPage() {
  await requireRole(["LAB_USER"]);
  const today = todayDateOnly();

  const lines = await prisma.submissionLine.findMany({
    where: { submission: { reportDate: today }, probableCases: { gt: 0 } },
    include: { disease: true, submission: { include: { state: true } } },
    orderBy: { probableCases: "desc" },
  });

  const pending = lines
    .map((l) => ({
      id: l.id,
      stateName: l.submission.state.name,
      diseaseName: l.disease.name,
      probableCases: l.probableCases,
      labConfirmed: l.labConfirmed,
      pending: Math.max(l.probableCases - l.labConfirmed, 0),
    }))
    .filter((l) => l.pending > 0);

  return <LabClient rows={pending} />;
}
