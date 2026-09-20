import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { addDays, todayDateOnly } from "@/lib/dates";
import { getNonReportingStreak } from "@/lib/kpis";

export default async function AlertsPage() {
  await requireRole(["DAHD_ADMIN", "DAHD_ANALYST"]);
  const today = todayDateOnly();

  const nonReporting = await getNonReportingStreak(2);

  // Spike detection: today's total per (state, disease) vs trailing 7-day avg
  const diseases = await prisma.disease.findMany({ where: { active: true } });
  const states = await prisma.stateUT.findMany({ where: { active: true } });
  const spikes: { state: string; disease: string; today: number; avg: number }[] = [];
  const newInState: { state: string; disease: string }[] = [];

  for (const disease of diseases) {
    for (const state of states) {
      const todayLine = await prisma.submissionLine.findFirst({
        where: { diseaseId: disease.id, submission: { stateId: state.id, reportDate: today } },
      });
      if (!todayLine || todayLine.totalCasesToday === 0) continue;

      let sum = 0;
      for (let i = 1; i <= 7; i++) {
        const d = addDays(today, -i);
        const l = await prisma.submissionLine.findFirst({
          where: { diseaseId: disease.id, submission: { stateId: state.id, reportDate: d } },
        });
        sum += l?.totalCasesToday ?? 0;
      }
      const avg = sum / 7;
      if (avg > 0 && todayLine.totalCasesToday > 3 * avg) {
        spikes.push({ state: state.name, disease: disease.name, today: todayLine.totalCasesToday, avg: Math.round(avg * 10) / 10 });
      }

      // First occurrence: no prior history of cases in this state for this disease
      const priorHistory = await prisma.submissionLine.findFirst({
        where: {
          diseaseId: disease.id,
          submission: { stateId: state.id, reportDate: { lt: today } },
          totalCasesToday: { gt: 0 },
        },
      });
      if (!priorHistory && todayLine.totalCasesToday > 0) {
        newInState.push({ state: state.name, disease: disease.name });
      }
    }
  }

  // Stale lab-pending > 14 days: probable > labConfirmed, submission older than 14 days ago still pending is approximated
  // by looking at today's rows where probable significantly exceeds confirmed and disease line createdAt is old.
  const stalePending = await prisma.submissionLine.findMany({
    where: {
      submission: { reportDate: today },
      createdAt: { lt: addDays(today, -14) },
    },
    include: { disease: true, submission: { include: { state: true } } },
  });
  const stalePendingFiltered = stalePending.filter((l) => l.probableCases > l.labConfirmed);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)]">Alert Feed</h1>

      <AlertSection title="Non-reporting ≥ 2 days" tone="danger">
        {nonReporting.length === 0 ? (
          <Empty />
        ) : (
          nonReporting.map((s) => (
            <Row key={s.stateId} left={s.name} right={`${s.daysMissing} days missing`} />
          ))
        )}
      </AlertSection>

      <AlertSection title="Spike alert — new cases &gt; 3× trailing 7-day average" tone="warning">
        {spikes.length === 0 ? (
          <Empty />
        ) : (
          spikes.map((s, i) => (
            <Row key={i} left={`${s.state} — ${s.disease}`} right={`Today ${s.today} vs avg ${s.avg}`} />
          ))
        )}
      </AlertSection>

      <AlertSection title="New occurrence in a State (first time reported)" tone="info">
        {newInState.length === 0 ? (
          <Empty />
        ) : (
          newInState.map((s, i) => <Row key={i} left={`${s.state} — ${s.disease}`} right="First occurrence" />)
        )}
      </AlertSection>

      <AlertSection title="Stale lab-pending &gt; 14 days" tone="warning">
        {stalePendingFiltered.length === 0 ? (
          <Empty />
        ) : (
          stalePendingFiltered.map((l) => (
            <Row
              key={l.id}
              left={`${l.submission.state.name} — ${l.disease.name}`}
              right={`${l.probableCases - l.labConfirmed} pending`}
            />
          ))
        )}
      </AlertSection>
    </div>
  );
}

function AlertSection({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className={`text-sm font-bold uppercase tracking-wide mb-2 badge-${tone}`} style={{ display: "inline-block" }}>
        {title}
      </h2>
      <div className="flex flex-col gap-1.5 mt-1">{children}</div>
    </div>
  );
}
function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="text-sm flex justify-between border-b border-border pb-1">
      <span>{left}</span>
      <span className="text-muted">{right}</span>
    </div>
  );
}
function Empty() {
  return <div className="text-xs text-muted">No alerts in this category.</div>;
}
