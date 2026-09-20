import { requireUser } from "@/lib/session";
import { todayDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  getReportingCompliance,
  getDiseaseKpis,
  getConfirmationFunnel,
  getStateLeaderboard,
  getNonReportingStreak,
  getDataQualityByState,
} from "@/lib/kpis";
import DiseaseKpiCard from "@/components/DiseaseKpiCard";
import DashboardFilters from "@/components/DashboardFilters";
import Link from "next/link";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ stateId?: string; districtId?: string; fromDate?: string; toDate?: string }>;
}) {
  const user = await requireUser();
  const today = todayDateOnly();
  const { stateId, districtId, fromDate, toDate } = await searchParams;

  if (user.role === "LAB_USER") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)] mb-2">Laboratory Dashboard</h1>
        <p className="text-sm text-muted mb-4">
          Update sample and lab-confirmation status. You cannot alter case counts submitted by States.
        </p>
        <Link href="/lab" className="btn-primary inline-block">
          Go to Lab Confirmations
        </Link>
      </div>
    );
  }

  const isNational = user.role === "DAHD_ADMIN" || user.role === "DAHD_ANALYST";
  const scopeStateId = isNational ? stateId : user.stateId ?? undefined;

  // Fetch states and districts for filters
  const [states, districts, compliance, diseaseKpis, funnel] = await Promise.all([
    prisma.stateUT.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.district.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    isNational ? getReportingCompliance(today) : null,
    getDiseaseKpis(scopeStateId, districtId, fromDate, toDate),
    getConfirmationFunnel(scopeStateId, districtId, fromDate, toDate),
  ]);

  const [leaderboard, nonReportingStreak, dataQuality] = isNational
    ? await Promise.all([getStateLeaderboard(), getNonReportingStreak(2), getDataQualityByState()])
    : [null, null, null];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-[color:var(--gt-purple-dark)]">
          {isNational ? "National Disease Surveillance Dashboard" : `${user.stateName} — State Dashboard`}
        </h1>
        <p className="text-sm text-muted">As on {today.toDateString()}</p>
      </div>

      {isNational && <DashboardFilters states={states} districts={districts} />}

      {isNational && compliance && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="States/UTs reported" value={`${compliance.reportedCount}/${compliance.total}`} tone="info" />
          <Stat label="On-time rate" value={`${compliance.onTimeRate}%`} tone={compliance.onTimeRate >= 80 ? "success" : "warning"} />
          <Stat label="Non-reporting" value={String(compliance.nonReporting.length)} tone={compliance.nonReporting.length > 0 ? "danger" : "success"} />
          <Stat label="Zero-report States" value={String(compliance.zeroReportingCount)} tone="info" />
          <Stat label="States with active cases" value={String(compliance.activeCaseReportingCount)} tone="warning" />
        </div>
      )}

      {isNational && compliance && compliance.nonReporting.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-2">States yet to submit today</h2>
          <div className="flex flex-wrap gap-1.5">
            {compliance.nonReporting.map((s) => (
              <span key={s.id} className="badge badge-danger">
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-2">Disease-wise KPIs</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {diseaseKpis.map((k) => (
            <DiseaseKpiCard key={k.diseaseId} kpi={k} />
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-3">Confirmation Funnel</h2>
          <div className="flex items-center justify-around text-center">
            <div>
              <div className="text-2xl font-bold text-[color:var(--gt-purple)]">{funnel.totalProbable}</div>
              <div className="text-xs text-muted">Probable</div>
            </div>
            <div className="text-muted">→</div>
            <div>
              <div className="text-2xl font-bold text-[color:var(--gt-orange)]">{funnel.totalConfirmed}</div>
              <div className="text-xs text-muted">Lab Confirmed</div>
            </div>
          </div>
          <div className="mt-3 text-sm flex justify-between border-t border-border pt-3">
            <span>Conversion rate</span>
            <strong>{funnel.conversionRate}%</strong>
          </div>
          <div className="text-sm flex justify-between">
            <span>Pending confirmation</span>
            <strong>{funnel.pendingConfirmation}</strong>
          </div>
        </div>

        {isNational && leaderboard && (
          <div className="card p-4">
            <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-3">
              State Leaderboard — by Active Cases
            </h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>State/UT</th>
                  <th>Active</th>
                  <th>Cumulative</th>
                  <th>CFR%</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard
                  .filter((r) => r.activeCases > 0 || r.cumulativeCases > 0)
                  .slice(0, 8)
                  .map((r) => (
                    <tr key={r.stateId}>
                      <td>{r.name}</td>
                      <td>{r.activeCases}</td>
                      <td>{r.cumulativeCases}</td>
                      <td>{r.cfr}</td>
                    </tr>
                  ))}
                {leaderboard.every((r) => r.activeCases === 0 && r.cumulativeCases === 0) && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-3">
                      No cases reported yet today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isNational && nonReportingStreak && nonReportingStreak.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-2">
            Alert Feed — Non-reporting ≥ 2 days
          </h2>
          <div className="flex flex-col gap-1.5">
            {nonReportingStreak.slice(0, 10).map((s) => (
              <div key={s.stateId} className="text-sm flex justify-between border-b border-border pb-1">
                <span>{s.name}</span>
                <span className="badge badge-danger">{s.daysMissing} days missing</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isNational && dataQuality && (
        <div className="card p-4">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-2">
            Data Quality Panel — Bulk Upload Pass Rate by State
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>State/UT</th>
                <th>Rows uploaded</th>
                <th>Rejected</th>
                <th>Pass rate</th>
                <th>Corrections logged</th>
              </tr>
            </thead>
            <tbody>
              {dataQuality
                .filter((r) => r.uploadedRows > 0 || r.corrections > 0)
                .map((r) => (
                  <tr key={r.stateId}>
                    <td>{r.name}</td>
                    <td>{r.uploadedRows}</td>
                    <td>{r.rejectedRows}</td>
                    <td>{r.passRate}%</td>
                    <td>{r.corrections}</td>
                  </tr>
                ))}
              {dataQuality.every((r) => r.uploadedRows === 0 && r.corrections === 0) && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-3">
                    No bulk uploads or corrections recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "info" }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${tone === "danger" ? "text-[color:var(--danger)]" : tone === "success" ? "text-[color:var(--success)]" : tone === "warning" ? "text-[color:var(--warning)]" : "text-[color:var(--info)]"}`}>
        {value}
      </div>
    </div>
  );
}
