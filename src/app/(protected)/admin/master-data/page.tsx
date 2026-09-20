import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import MasterDataClient from "./MasterDataClient";

export default async function MasterDataPage() {
  await requireRole(["DAHD_ADMIN"]);

  const [states, diseases, species, nodalOfficers, catchAllReports] = await Promise.all([
    prisma.stateUT.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { districts: true } } } }),
    prisma.disease.findMany({ orderBy: { name: "asc" } }),
    prisma.species.findMany({ orderBy: { name: "asc" } }),
    prisma.nodalOfficer.findMany({ include: { state: true }, orderBy: { state: { name: "asc" } } }),
    prisma.submissionLine.findMany({
      where: { disease: { isCatchAll: true }, remarks: { not: null } },
      include: { disease: true, submission: { include: { state: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const districts = await prisma.district.findMany({ orderBy: { name: "asc" }, include: { state: true } });

  return (
    <MasterDataClient
      states={states}
      districts={districts}
      diseases={diseases}
      species={species}
      nodalOfficers={nodalOfficers}
      catchAllReports={catchAllReports.map((l) => ({
        id: l.id,
        stateName: l.submission.state.name,
        remarks: l.remarks ?? "",
        reportDate: l.submission.reportDate.toISOString(),
      }))}
    />
  );
}
