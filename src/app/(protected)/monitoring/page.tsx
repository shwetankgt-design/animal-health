import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/dates";
import MonitoringDashboard from "@/components/MonitoringDashboard";

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ stateId?: string; districtId?: string }>;
}) {
  await requireUser();
  const { stateId, districtId } = await searchParams;

  // Get last 7 days of data
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = addDays(today, -7);

  // Fetch all states and districts for filters
  const allStates = await prisma.stateUT.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const allDistricts = districtId
    ? []
    : stateId
      ? await prisma.district.findMany({ where: { stateId, active: true }, orderBy: { name: "asc" } })
      : [];

  // Build filter where clause
  const lineWhere: any = {};
  if (stateId) {
    lineWhere.submission = { stateId };
  }
  if (districtId) {
    lineWhere.districtId = districtId;
  }

  // Aggregate submission line data based on filters
  const allLines = await prisma.submissionLine.findMany({
    where: lineWhere,
    include: { disease: true, submission: { include: { state: true } } },
  });

  const last7DaysLines = allLines.filter((l) => {
    const reportDate = new Date(l.submission.reportDate);
    reportDate.setUTCHours(0, 0, 0, 0);
    return reportDate >= sevenDaysAgo && reportDate <= today;
  });

  // Calculate total metrics
  const totalCases = allLines.reduce((a, l) => a + l.totalCasesToday, 0);
  const totalDeaths = allLines.reduce((a, l) => a + l.deathsToday, 0);
  const activeCases = allLines.reduce((a, l) => a + l.activeCases, 0);
  const cfr = totalCases > 0 ? (totalDeaths / totalCases) * 100 : 0;

  // 7-day trend
  const trendMap = new Map<string, { cases: number; deaths: number }>();
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, -i);
    const dateStr = date.toISOString().slice(0, 10);
    trendMap.set(dateStr, { cases: 0, deaths: 0 });
  }
  last7DaysLines.forEach((l) => {
    const dateStr = l.submission.reportDate.toISOString().slice(0, 10);
    const entry = trendMap.get(dateStr);
    if (entry) {
      entry.cases += l.totalCasesToday;
      entry.deaths += l.deathsToday;
    }
  });
  const diseaseTrend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { cases, deaths }]) => ({ date: date.slice(5), cases, deaths }));

  // Disease-wise breakdown
  const diseaseMap = new Map<
    string,
    { name: string; newCases: number; deaths: number; active: number; cumulative: number; count: number }
  >();
  allLines.forEach((l) => {
    const key = l.disease.name;
    if (!diseaseMap.has(key)) {
      diseaseMap.set(key, { name: key, newCases: 0, deaths: 0, active: 0, cumulative: 0, count: 0 });
    }
    const entry = diseaseMap.get(key)!;
    entry.newCases += l.totalCasesToday;
    entry.deaths += l.deathsToday;
    entry.active += l.activeCases;
    entry.cumulative += l.cumulativeCases;
    entry.count += 1;
  });
  const topDiseases = Array.from(diseaseMap.values())
    .map((d) => ({
      ...d,
      cfr: d.newCases > 0 ? (d.deaths / d.newCases) * 100 : 0,
      recoveryRate: d.cumulative > 0 ? ((d.cumulative - d.active - d.deaths) / d.cumulative) * 100 : 0,
      trend7d: [],
    }))
    .sort((a, b) => b.cumulative - a.cumulative);

  // State-wise breakdown
  const stateMap = new Map<string, { name: string; cases: number; deaths: number; diseases: Set<string>; submitted: boolean }>();
  const submissions = await prisma.submission.findMany({
    where: { reportDate: { gte: sevenDaysAgo, lte: today } },
    include: { state: true },
  });
  submissions.forEach((s) => {
    if (!stateMap.has(s.stateId)) {
      stateMap.set(s.stateId, { name: s.state.name, cases: 0, deaths: 0, diseases: new Set(), submitted: s.status === "SUBMITTED" });
    }
  });
  allLines.forEach((l) => {
    const key = l.submission.stateId;
    const entry = stateMap.get(key);
    if (entry) {
      entry.cases += l.totalCasesToday;
      entry.deaths += l.deathsToday;
      entry.diseases.add(l.disease.name);
    }
  });
  const statePerformance = Array.from(stateMap.values())
    .map((s) => ({
      ...s,
      diseases: s.diseases.size,
    }))
    .sort((a, b) => b.cases - a.cases);

  // Submission rate
  const submittedToday = submissions.filter((s) => {
    const reportDate = new Date(s.reportDate);
    reportDate.setUTCHours(0, 0, 0, 0);
    const today_ = new Date();
    today_.setUTCHours(0, 0, 0, 0);
    return reportDate.getTime() === today_.getTime() && s.status === "SUBMITTED";
  }).length;
  const submissionRate = allStates.length > 0 ? Math.round((submittedToday / allStates.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-[color:var(--gt-purple-dark)]">Monitoring Dashboard</h1>
        <p className="text-sm text-muted">Real-time disease surveillance metrics across all States/UTs</p>
      </div>
      <MonitoringDashboard
        data={{
          totalCases,
          totalDeaths,
          activeCases,
          caseFatalityRate: cfr,
          recoveryRate: totalCases > 0 ? ((totalCases - activeCases - totalDeaths) / totalCases) * 100 : 0,
          diseaseTrend,
          topDiseases,
          statePerformance,
          submissionRate,
        }}
        states={allStates}
        districts={allDistricts}
        selectedStateId={stateId}
        selectedDistrictId={districtId}
      />
    </div>
  );
}
