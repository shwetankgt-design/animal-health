"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  id: string;
  stateName: string;
  diseaseName: string;
  probableCases: number;
  labConfirmed: number;
  pending: number;
}

export default function LabClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/lab/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId: id, additionalConfirmed: Number(values[id] || 0) }),
    });
    const data = await res.json();
    setBusy(null);
    if (data.error) setError(data.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)]">Lab Confirmations — Pending Queue</h1>
        <p className="text-sm text-muted">
          Update sample/lab-confirmation status only. You cannot alter States&apos; submitted case counts directly.
        </p>
      </div>
      {error && <div className="card p-3 text-sm text-[color:var(--danger)]">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>State/UT</th>
              <th>Disease</th>
              <th>Probable</th>
              <th>Lab Confirmed</th>
              <th>Pending</th>
              <th>Confirm additional</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.stateName}</td>
                <td>{r.diseaseName}</td>
                <td>{r.probableCases}</td>
                <td>{r.labConfirmed}</td>
                <td>
                  <span className="badge badge-warning">{r.pending}</span>
                </td>
                <td className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={r.pending}
                    className="w-20"
                    value={values[r.id] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value }))}
                  />
                  <button className="btn-primary text-xs" disabled={busy === r.id} onClick={() => confirm(r.id)}>
                    {busy === r.id ? "Saving…" : "Confirm"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-6">
                  No pending confirmations today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
