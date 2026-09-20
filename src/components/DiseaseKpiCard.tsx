"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { DiseaseKpi } from "@/lib/kpis";

export default function DiseaseKpiCard({ kpi }: { kpi: DiseaseKpi }) {
  const hasActivity = kpi.cumulativeCases > 0 || kpi.newCasesToday > 0;
  return (
    <div className="card p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{kpi.diseaseName}</span>
        {kpi.statesAffected > 0 && <span className="badge badge-info">{kpi.statesAffected} State(s)</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Metric label="New cases today" value={kpi.newCasesToday} />
        <Metric label="New deaths today" value={kpi.newDeathsToday} />
        <Metric label="Active cases" value={kpi.activeCases} />
        <Metric label="Cumulative cases" value={kpi.cumulativeCases} />
        <Metric label="CFR" value={`${kpi.cfr}%`} />
        <Metric label="Recovery rate" value={`${kpi.recoveryRate}%`} />
      </div>
      {hasActivity && (
        <div className="h-10 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={kpi.sparkline}>
              <YAxis hide domain={[0, "auto"]} />
              <Line type="monotone" dataKey="cases" stroke="var(--gt-orange)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
