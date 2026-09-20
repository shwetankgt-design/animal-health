"use client";

import { useState } from "react";

interface Row {
  diseaseName: string;
  stateName: string;
  newCases: number;
  deaths: number;
  speciesSet: string[];
  controlMeasures: string[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function MonthlyReportClient() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    const res = await fetch(`/api/reports/monthly?month=${month}&year=${year}`);
    const data = await res.json();
    setRows(data.rows);
    setBusy(false);
  }

  function downloadXlsx() {
    window.location.href = `/api/reports/monthly?month=${month}&year=${year}&format=xlsx`;
  }

  function downloadPdf() {
    window.location.href = `/api/reports/monthly?month=${month}&year=${year}&format=pdf`;
  }

  const totalCases = rows?.reduce((a, r) => a + r.newCases, 0) ?? 0;
  const totalDeaths = rows?.reduce((a, r) => a + r.deaths, 0) ?? 0;
  const diseasesAffected = new Set(rows?.map((r) => r.diseaseName)).size;
  const statesAffected = new Set(rows?.map((r) => r.stateName)).size;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)]">Monthly Situation Report</h1>
        <p className="text-sm text-muted">
          Auto-generated directly from submitted KPI data — no manual compilation.
        </p>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium flex flex-col gap-1">
          Month
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium flex flex-col gap-1">
          Year
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
        </label>
        <button className="btn-primary" onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate report"}
        </button>
        {rows && (
          <>
            <button className="btn-secondary" onClick={downloadXlsx}>
              Download as Excel
            </button>
            <button className="btn-secondary" onClick={downloadPdf}>
              Download as PDF
            </button>
          </>
        )}
      </div>

      {rows && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total new cases" value={totalCases} />
            <Stat label="Total deaths" value={totalDeaths} />
            <Stat label="Diseases reported" value={diseasesAffected} />
            <Stat label="States/UTs affected" value={statesAffected} />
          </div>

          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Disease</th>
                  <th>State/UT</th>
                  <th>New cases</th>
                  <th>Deaths</th>
                  <th>Species affected</th>
                  <th>Control measures</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.diseaseName}</td>
                    <td>{r.stateName}</td>
                    <td>{r.newCases}</td>
                    <td>{r.deaths}</td>
                    <td>{r.speciesSet.join(", ") || "—"}</td>
                    <td>{r.controlMeasures.join("; ") || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-6">
                      No data for this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-xl font-bold text-[color:var(--gt-purple)]">{value}</div>
    </div>
  );
}
