"use client";

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface StateOption {
  id: string;
  name: string;
}

interface DistrictOption {
  id: string;
  name: string;
}

interface DiseaseMetric {
  name: string;
  newCases: number;
  deaths: number;
  active: number;
  cumulative: number;
  cfr: number;
  recoveryRate: number;
  trend7d: number[];
}

interface StateMetric {
  name: string;
  cases: number;
  deaths: number;
  diseases: number;
  submitted: boolean;
}

interface MonitoringData {
  totalCases: number;
  totalDeaths: number;
  activeCases: number;
  caseFatalityRate: number;
  recoveryRate: number;
  diseaseTrend: Array<{ date: string; cases: number; deaths: number }>;
  topDiseases: DiseaseMetric[];
  statePerformance: StateMetric[];
  submissionRate: number;
}

const COLORS = ["#492e6c", "#ff7900", "#92278f", "#2e1c47", "#6b6478", "#f5a623", "#50e3c2", "#d0021b", "#417505", "#1a4d7a"];

export default function MonitoringDashboard({
  data,
  states = [],
  districts = [],
  selectedStateId,
  selectedDistrictId,
}: {
  data: MonitoringData;
  states?: StateOption[];
  districts?: DistrictOption[];
  selectedStateId?: string;
  selectedDistrictId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tempStateId, setTempStateId] = useState(selectedStateId || "");
  const [tempDistrictId, setTempDistrictId] = useState(selectedDistrictId || "");

  const handleStateChange = (newStateId: string) => {
    setTempStateId(newStateId);
    // Reset district when state changes
    const params = new URLSearchParams(searchParams);
    if (newStateId) {
      params.set("stateId", newStateId);
      params.delete("districtId");
    } else {
      params.delete("stateId");
      params.delete("districtId");
    }
    router.push(`?${params.toString()}`);
  };

  const handleDistrictChange = (newDistrictId: string) => {
    setTempDistrictId(newDistrictId);
    const params = new URLSearchParams(searchParams);
    if (newDistrictId) {
      params.set("districtId", newDistrictId);
    } else {
      params.delete("districtId");
    }
    router.push(`?${params.toString()}`);
  };

  const clearFilters = () => {
    setTempStateId("");
    setTempDistrictId("");
    router.push("?");
  };
  const cfr = data.totalCases > 0 ? ((data.totalDeaths / data.totalCases) * 100).toFixed(2) : "0";
  const recovery = data.totalCases > 0 ? (((data.totalCases - data.activeCases - data.totalDeaths) / data.totalCases) * 100).toFixed(2) : "0";

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Filter Controls */}
      <div className="card p-4 flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-end flex-wrap">
        <div className="flex flex-col gap-1 w-full sm:w-auto min-w-[200px]">
          <label className="text-xs font-medium">State/UT</label>
          <select
            value={tempStateId}
            onChange={(e) => handleStateChange(e.target.value)}
            className="text-sm px-2 py-1.5 border border-border rounded"
          >
            <option value="">All States/UTs</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {tempStateId && districts.length > 0 && (
          <div className="flex flex-col gap-1 w-full sm:w-auto min-w-[200px]">
            <label className="text-xs font-medium">District</label>
            <select
              value={tempDistrictId}
              onChange={(e) => handleDistrictChange(e.target.value)}
              className="text-sm px-2 py-1.5 border border-border rounded"
            >
              <option value="">All Districts</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {(tempStateId || tempDistrictId) && (
          <button
            onClick={clearFilters}
            className="btn-secondary text-xs px-3 py-1.5 w-full sm:w-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Total Cases"
          value={data.totalCases.toLocaleString()}
          tone="info"
          subtext={`Active: ${data.activeCases.toLocaleString()}`}
        />
        <KpiCard label="Total Deaths" value={data.totalDeaths.toLocaleString()} tone="danger" subtext={`CFR: ${cfr}%`} />
        <KpiCard label="Active Cases" value={data.activeCases.toLocaleString()} tone="warning" subtext="Ongoing treatment" />
        <KpiCard label="Recovered" value={((data.totalCases - data.activeCases - data.totalDeaths) as any).toLocaleString()} tone="success" subtext={`${recovery}%`} />
      </div>

      {/* 7-Day Trend Line */}
      <div className="card p-3 sm:p-4 w-full overflow-x-auto">
        <h2 className="text-xs sm:text-sm font-bold text-muted uppercase tracking-wide mb-3">7-Day Case & Death Trend</h2>
        <ResponsiveContainer width="100%" height={220} minWidth={300}>
          <LineChart data={data.diseaseTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
            <XAxis dataKey="date" stroke="#999" fontSize={12} />
            <YAxis stroke="#999" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #ddd" }} />
            <Legend />
            <Line type="monotone" dataKey="cases" stroke="#492e6c" strokeWidth={2} name="New Cases" dot={{ r: 4 }} />
            <Line type="monotone" dataKey="deaths" stroke="#d0021b" strokeWidth={2} name="Deaths" dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Disease Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        {/* Top Diseases Bar Chart */}
        <div className="card p-3 sm:p-4 w-full overflow-x-auto">
          <h2 className="text-xs sm:text-sm font-bold text-muted uppercase tracking-wide mb-3">Top 10 Diseases by Cases</h2>
          <ResponsiveContainer width="100%" height={280} minWidth={300}>
            <BarChart data={data.topDiseases.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={11} />
              <YAxis fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #ddd" }} />
              <Bar dataKey="cumulative" fill="#492e6c" name="Cumulative Cases" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Disease Status Pie */}
        <div className="card p-3 sm:p-4 w-full overflow-x-auto">
          <h2 className="text-xs sm:text-sm font-bold text-muted uppercase tracking-wide mb-3">Active vs Recovered vs Deaths</h2>
          <ResponsiveContainer width="100%" height={280} minWidth={300}>
            <PieChart>
              <Pie
                data={[
                  { name: "Active", value: data.activeCases },
                  { name: "Recovered", value: Math.max(0, data.totalCases - data.activeCases - data.totalDeaths) },
                  { name: "Deaths", value: data.totalDeaths },
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {["Active", "Recovered", "Deaths"].map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* State Performance Leaderboard */}
      <div className="card p-3 sm:p-4 w-full">
        <h2 className="text-xs sm:text-sm font-bold text-muted uppercase tracking-wide mb-3">State-wise Performance ({data.statePerformance.length} States)</h2>
        <div className="overflow-x-auto -mx-3 sm:-mx-4">
          <table className="data-table text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="px-2 sm:px-3">State/UT</th>
                <th className="text-right px-2 sm:px-3">Cases</th>
                <th className="text-right px-2 sm:px-3">Deaths</th>
                <th className="text-right px-2 sm:px-3">CFR %</th>
                <th className="text-center px-2 sm:px-3">Diseases</th>
                <th className="text-center px-2 sm:px-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.statePerformance.slice(0, 20).map((state, i) => {
                const stateCfr = state.cases > 0 ? ((state.deaths / state.cases) * 100).toFixed(1) : "0";
                return (
                  <tr key={i}>
                    <td className="font-medium px-2 sm:px-3">{state.name}</td>
                    <td className="text-right px-2 sm:px-3">{state.cases.toLocaleString()}</td>
                    <td className="text-right px-2 sm:px-3">{state.deaths.toLocaleString()}</td>
                    <td className="text-right px-2 sm:px-3">{stateCfr}%</td>
                    <td className="text-center px-2 sm:px-3">{state.diseases}</td>
                    <td className="text-center px-2 sm:px-3">
                      <span className={`badge text-xs ${state.submitted ? "badge-success" : "badge-warning"}`}>
                        {state.submitted ? "✓" : "Pending"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-muted mt-2">
          Submission Rate: <strong>{data.submissionRate}%</strong>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone, subtext }: { label: string; value: string; tone: string; subtext?: string }) {
  const toneMap: Record<string, string> = {
    success: "text-[color:var(--success)]",
    danger: "text-[color:var(--danger)]",
    warning: "text-[color:var(--warning)]",
    info: "text-[color:var(--gt-purple)]",
  };

  return (
    <div className="card p-3 sm:p-4">
      <div className="text-xs text-muted mb-1 font-medium">{label}</div>
      <div className={`text-lg sm:text-2xl font-bold ${toneMap[tone]} break-words`}>{value}</div>
      {subtext && <div className="text-xs text-muted mt-1">{subtext}</div>}
    </div>
  );
}
