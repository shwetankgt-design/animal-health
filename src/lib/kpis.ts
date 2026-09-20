import { prisma } from "@/lib/prisma";
import { addDays, dateOnly, isoDate, todayDateOnly } from "@/lib/dates";

// Filter dates arrive from the URL, so anything unparseable is ignored rather than
// reaching Prisma as an Invalid Date.
function parseFilterDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : dateOnly(parsed);
}

export async function getReportingCompliance(reportDate: Date) {
  const date = dateOnly(reportDate);
  const [allStates, submittedStates, zeroStates] = await Promise.all([
    prisma.stateUT.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.submission.findMany({ where: { reportDate: date, status: "SUBMITTED" }, select: { stateId: true } }),
    prisma.zeroReport.findMany({ where: { reportDate: date }, select: { stateId: true } }),
  ]);
  const submittedIds = new Set(submittedStates.map((s) => s.stateId));
  const zeroIds = new Set(zeroStates.map((s) => s.stateId));

  const reported = allStates.filter((s) => submittedIds.has(s.id));
  const nonReporting = allStates.filter((s) => !submittedIds.has(s.id));
  const zeroReportingCount = allStates.filter((s) => zeroIds.has(s.id) && submittedIds.has(s.id)).length;
  const activeCaseReportingCount = reported.length - zeroReportingCount;

  return {
    total: allStates.length,
    reportedCount: reported.length,
    onTimeRate: allStates.length ? Math.round((reported.length / allStates.length) * 100) : 0,
    nonReporting: nonReporting.map((s) => ({ id: s.id, name: s.name })),
    zeroReportingCount,
    activeCaseReportingCount,
  };
}

export async function getNonReportingStreak(minDays = 2) {
  const states = await prisma.stateUT.findMany({ where: { active: true } });
  const results: { stateId: string; name: string; daysMissing: number }[] = [];
  const today = todayDateOnly();

  for (const s of states) {
    let missing = 0;
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, -i);
      const sub = await prisma.submission.findUnique({
        where: { stateId_reportDate: { stateId: s.id, reportDate: d } },
      });
      if (sub?.status === "SUBMITTED") break;
      missing++;
    }
    if (missing >= minDays) results.push({ stateId: s.id, name: s.name, daysMissing: missing });
  }
  return results.sort((a, b) => b.daysMissing - a.daysMissing);
}

export interface DiseaseKpi {
  diseaseId: string;
  diseaseName: string;
  newCasesToday: number;
  newDeathsToday: number;
  activeCases: number;
  cumulativeCases: number;
  cumulativeDeaths: number;
  cfr: number; // %
  recoveryRate: number; // %
  sparkline: { date: string; cases: number }[];
  statesAffected: number;
}

export async function getDiseaseKpis(
  stateId?: string,
  districtId?: string,
  fromDate?: string,
  toDate?: string
): Promise<DiseaseKpi[]> {
  const diseases = await prisma.disease.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const today = todayDateOnly();

  const startDate = parseFilterDate(fromDate) ?? today;
  const endDate = parseFilterDate(toDate) ?? today;

  // The trend line always needs a multi-day window: fall back to the trailing
  // week when the user has not picked a range, otherwise it collapses to one point.
  const sparkEnd = endDate;
  const requestedStart = fromDate || toDate ? startDate : addDays(endDate, -6);
  const earliestTrendDay = addDays(sparkEnd, -89);
  const sparkStart =
    requestedStart > sparkEnd ? sparkEnd : requestedStart < earliestTrendDay ? earliestTrendDay : requestedStart;

  const results: DiseaseKpi[] = [];

  for (const disease of diseases) {
    // Build where clause with optional filters
    const submissionWhere: any = { reportDate: { gte: startDate, lte: endDate } };
    if (stateId) submissionWhere.stateId = stateId;

    const whereBase: any = {
      diseaseId: disease.id,
      submission: submissionWhere,
    };
    if (districtId) whereBase.districtId = districtId;

    const linesToday = await prisma.submissionLine.findMany({ where: whereBase });

    const newCasesToday = linesToday.reduce((a, l) => a + l.totalCasesToday, 0);
    const newDeathsToday = linesToday.reduce((a, l) => a + l.deathsToday, 0);
    const activeCases = linesToday.reduce((a, l) => a + l.activeCases, 0);
    const cumulativeCases = linesToday.reduce((a, l) => a + l.cumulativeCases, 0);
    const cumulativeDeaths = linesToday.reduce((a, l) => a + l.cumulativeDeaths, 0);
    const recovered = linesToday.reduce((a, l) => a + l.recoveredCumulative, 0);

    const cfr = cumulativeCases > 0 ? Math.round((cumulativeDeaths / cumulativeCases) * 1000) / 10 : 0;
    const recoveryRate = cumulativeCases > 0 ? Math.round((recovered / cumulativeCases) * 1000) / 10 : 0;

    const sparkSubmissionWhere: any = { reportDate: { gte: sparkStart, lte: sparkEnd } };
    if (stateId) sparkSubmissionWhere.stateId = stateId;

    const sparkWhere: any = { diseaseId: disease.id, submission: sparkSubmissionWhere };
    if (districtId) sparkWhere.districtId = districtId;

    const sparkLines = await prisma.submissionLine.findMany({
      where: sparkWhere,
      select: { totalCasesToday: true, submission: { select: { reportDate: true } } },
    });

    const byDate = new Map<string, number>();
    for (let d = sparkStart; d <= sparkEnd; d = addDays(d, 1)) {
      byDate.set(isoDate(d), 0);
    }
    for (const l of sparkLines) {
      const key = isoDate(l.submission.reportDate);
      byDate.set(key, (byDate.get(key) ?? 0) + l.totalCasesToday);
    }
    const sparkline = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cases]) => ({ date: date.slice(5), cases }));

    const statesAffectedWhere: any = {
      diseaseId: disease.id,
      activeCases: { gt: 0 },
      submission: { reportDate: { gte: startDate, lte: endDate } },
    };
    if (stateId) statesAffectedWhere.submission.stateId = stateId;
    if (districtId) statesAffectedWhere.districtId = districtId;

    const statesAffectedRows = await prisma.submissionLine.findMany({
      where: statesAffectedWhere,
      select: { submission: { select: { stateId: true } } },
    });
    const statesAffected = new Set(statesAffectedRows.map((r) => r.submission.stateId)).size;

    results.push({
      diseaseId: disease.id,
      diseaseName: disease.name,
      newCasesToday,
      newDeathsToday,
      activeCases,
      cumulativeCases,
      cumulativeDeaths,
      cfr,
      recoveryRate,
      sparkline,
      statesAffected,
    });
  }
  return results;
}

export async function getConfirmationFunnel(
  stateId?: string,
  districtId?: string,
  fromDate?: string,
  toDate?: string
) {
  const today = todayDateOnly();
  const startDate = parseFilterDate(fromDate) ?? today;
  const endDate = parseFilterDate(toDate) ?? today;

  const submissionWhere: any = { reportDate: { gte: startDate, lte: endDate } };
  if (stateId) submissionWhere.stateId = stateId;

  const where: any = { submission: submissionWhere };
  if (districtId) where.districtId = districtId;

  const lines = await prisma.submissionLine.findMany({ where });
  const totalProbable = lines.reduce((a, l) => a + l.probableCases, 0);
  const totalConfirmed = lines.reduce((a, l) => a + l.labConfirmed, 0);
  const conversionRate = totalProbable > 0 ? Math.round((totalConfirmed / totalProbable) * 1000) / 10 : 0;
  const pendingConfirmation = Math.max(totalProbable - totalConfirmed, 0);
  return { totalProbable, totalConfirmed, conversionRate, pendingConfirmation };
}

export async function getStateLeaderboard() {
  const states = await prisma.stateUT.findMany({ where: { active: true } });
  const today = todayDateOnly();
  const rows: { stateId: string; name: string; activeCases: number; cumulativeCases: number; cfr: number }[] = [];
  for (const s of states) {
    const lines = await prisma.submissionLine.findMany({ where: { submission: { stateId: s.id, reportDate: today } } });
    const activeCases = lines.reduce((a, l) => a + l.activeCases, 0);
    const cumulativeCases = lines.reduce((a, l) => a + l.cumulativeCases, 0);
    const cumulativeDeaths = lines.reduce((a, l) => a + l.cumulativeDeaths, 0);
    const cfr = cumulativeCases > 0 ? Math.round((cumulativeDeaths / cumulativeCases) * 1000) / 10 : 0;
    rows.push({ stateId: s.id, name: s.name, activeCases, cumulativeCases, cfr });
  }
  return rows.sort((a, b) => b.activeCases - a.activeCases);
}

export async function getDataQualityByState() {
  const states = await prisma.stateUT.findMany({ where: { active: true } });
  const rows = [];
  for (const s of states) {
    const batches = await prisma.uploadBatch.findMany({ where: { stateId: s.id }, include: { rows: true } });
    const allRows = batches.flatMap((b) => b.rows);
    const total = allRows.length;
    const rejected = allRows.filter((r) => r.result === "REJECTED").length;
    const passRate = total > 0 ? Math.round(((total - rejected) / total) * 1000) / 10 : 100;
    const corrections = await prisma.auditLog.count({
      where: { action: "CORRECTION", submission: { stateId: s.id } },
    });
    rows.push({ stateId: s.id, name: s.name, uploadedRows: total, rejectedRows: rejected, passRate, corrections });
  }
  return rows;
}
