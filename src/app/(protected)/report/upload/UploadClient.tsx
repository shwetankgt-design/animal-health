"use client";

import { useState } from "react";
import { todayDateOnly, isoDate } from "@/lib/dates";

interface Violation {
  field: string;
  rule: string;
  valueReceived: string;
  expected: string;
  severity: "BLOCK" | "WARNING";
  cellRef?: string;
}
interface RowResult {
  id: string;
  rowIndex: number;
  stateRaw?: string;
  diseaseRaw?: string;
  result: "ACCEPTED" | "ACCEPTED_WARNING" | "REJECTED";
  violations: Violation[];
  uploadNotes?: string;
}

const FIELD_LABELS: Record<string, string> = {
  stateRaw: "State/UT",
  diseaseRaw: "Disease",
  speciesRaw: "Species",
  districtRaw: "District",
  village: "Village / epicentre",
  block: "Block",
  probableCases: "Probable/Clinically Infected",
  labConfirmed: "Lab Confirmed",
  deathsToday: "Deaths that day",
  cumulativeCases: "Cumulative cases since 1 Jan",
  activeCases: "Active cases as on date",
  cumulativeDeaths: "Cumulative deaths since 1 Jan",
  recoveredCumulative: "Recovered animals cumulative",
  vaccinationCumulative: "Vaccination since 1 Jan",
  culledCount: "Animals culled/slaughtered",
  controlMeasures: "Control measures undertaken",
  remarks: "Remarks",
};

export default function UploadClient({ stateName }: { stateName: string }) {
  const [reportDate, setReportDate] = useState(isoDate(todayDateOnly()));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowResult[]>([]);
  const [needsMapping, setNeedsMapping] = useState(false);
  const [headerRowValues, setHeaderRowValues] = useState<(string | undefined)[]>([]);
  const [detectedMapping, setDetectedMapping] = useState<Record<string, number>>({});
  const [fieldDictionary, setFieldDictionary] = useState<string[]>([]);
  const [manualAssign, setManualAssign] = useState<Record<number, string>>({}); // columnIndex -> field
  const [error, setError] = useState<string | null>(null);
  const [ackIds, setAckIds] = useState<Set<string>>(new Set());
  const [commitResult, setCommitResult] = useState<{ committed: number; skipped: number } | null>(null);

  async function stage(manualMapping?: Record<string, number>) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setCommitResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("reportDate", reportDate);
    if (manualMapping) fd.append("manualMapping", JSON.stringify(manualMapping));
    const res = await fetch("/api/upload/stage", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    if (data.needsManualMapping) {
      setNeedsMapping(true);
      setHeaderRowValues(data.headerRowValues);
      setDetectedMapping(data.detectedMapping);
      setFieldDictionary(data.fieldDictionary);
      // Pre-fill the assignment grid with whatever the auto-detector already matched
      const preset: Record<number, string> = {};
      for (const [field, idx] of Object.entries(data.detectedMapping as Record<string, number>)) {
        preset[idx] = field;
      }
      setManualAssign(preset);
      return;
    }
    setNeedsMapping(false);
    setBatchId(data.batchId);
    setRows(data.rows);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    await stage();
  }

  async function submitManualMapping() {
    const manualMapping: Record<string, number> = {};
    for (const [idxStr, field] of Object.entries(manualAssign)) {
      if (field) manualMapping[field] = Number(idxStr);
    }
    await stage(manualMapping);
  }

  function toggleAck(id: string) {
    setAckIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function commit() {
    if (!batchId) return;
    setBusy(true);
    const res = await fetch("/api/upload/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, reportDate, acknowledgedRowIds: Array.from(ackIds) }),
    });
    const data = await res.json();
    setBusy(false);
    setCommitResult(data);
  }

  function downloadRejected() {
    const rejected = rows.filter((r) => r.result === "REJECTED");
    const lines = [
      "Row,State,Disease,Field,Rule Violated,Value Received,Expected,Cell",
      ...rejected.flatMap((r) =>
        r.violations.map(
          (v) =>
            `${r.rowIndex},"${r.stateRaw ?? ""}","${r.diseaseRaw ?? ""}","${v.field}","${v.rule.replace(/"/g, "'")}","${v.valueReceived}","${v.expected}","${v.cellRef ?? ""}"`
        )
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rejected_rows.csv";
    a.click();
  }

  const accepted = rows.filter((r) => r.result === "ACCEPTED");
  const warned = rows.filter((r) => r.result === "ACCEPTED_WARNING");
  const rejected = rows.filter((r) => r.result === "REJECTED");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)]">Bulk Upload — {stateName}</h1>
        <p className="text-sm text-muted">
          Upload your State&apos;s daily .xlsx report. Every row is staged and run through the same validation
          rules as manual entry — nothing writes to the database until you review and confirm.
        </p>
      </div>

      <form onSubmit={handleUpload} className="card p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium flex flex-col gap-1">
          Report date
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        </label>
        <label className="text-xs font-medium flex flex-col gap-1">
          .xlsx file
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button className="btn-primary" type="submit" disabled={busy || !file}>
          {busy ? "Processing…" : "Stage & validate"}
        </button>
      </form>

      {error && <div className="card p-4 text-sm text-[color:var(--danger)]">{error}</div>}

      {needsMapping && (
        <div className="card p-4 flex flex-col gap-3">
          <div className="text-sm">
            Column mapping confidence was low — several expected columns (State, Disease, Probable, Lab
            Confirmed) could not be matched automatically from the header row. Assign each column below to
            the field it actually contains, then stage again. Leave a column set to &quot;— ignore —&quot;
            if it doesn&apos;t map to anything in the field dictionary.
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Header text in file</th>
                  <th>Assign to field</th>
                </tr>
              </thead>
              <tbody>
                {headerRowValues.map((header, idx) => {
                  if (!header) return null;
                  return (
                    <tr key={idx}>
                      <td>{String.fromCharCode(65 + idx)}</td>
                      <td>{header}</td>
                      <td>
                        <select
                          value={manualAssign[idx] ?? ""}
                          onChange={(e) =>
                            setManualAssign((prev) => ({ ...prev, [idx]: e.target.value }))
                          }
                        >
                          <option value="">— ignore —</option>
                          {fieldDictionary.map((f) => (
                            <option key={f} value={f}>
                              {FIELD_LABELS[f] ?? f}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <button className="btn-primary" onClick={submitManualMapping} disabled={busy}>
              {busy ? "Processing…" : "Stage & validate with this mapping"}
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 text-center">
              <div className="text-2xl font-bold text-[color:var(--success)]">{accepted.length}</div>
              <div className="text-xs text-muted">Accepted</div>
            </div>
            <div className="card p-3 text-center">
              <div className="text-2xl font-bold text-[color:var(--warning)]">{warned.length}</div>
              <div className="text-xs text-muted">Accepted with warning</div>
            </div>
            <div className="card p-3 text-center">
              <div className="text-2xl font-bold text-[color:var(--danger)]">{rejected.length}</div>
              <div className="text-xs text-muted">Rejected</div>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>State</th>
                  <th>Disease</th>
                  <th>Result</th>
                  <th>Details</th>
                  <th>Ack</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.rowIndex}</td>
                    <td>{r.stateRaw ?? "—"}</td>
                    <td>{r.diseaseRaw ?? "—"}</td>
                    <td>
                      <span
                        className={`badge ${
                          r.result === "ACCEPTED" ? "badge-success" : r.result === "ACCEPTED_WARNING" ? "badge-warning" : "badge-danger"
                        }`}
                      >
                        {r.result.replace("_", " ")}
                      </span>
                    </td>
                    <td className="text-xs max-w-md">
                      {r.uploadNotes && <div className="text-muted italic mb-1">Upload note: {r.uploadNotes}</div>}
                      {r.violations.map((v, i) => (
                        <div key={i} style={{ color: v.severity === "BLOCK" ? "var(--danger)" : "var(--warning)" }}>
                          <strong>{v.field}</strong> ({v.cellRef ?? "—"}): {v.rule} Received: {v.valueReceived}. Expected: {v.expected}.
                        </div>
                      ))}
                    </td>
                    <td>
                      {r.result === "ACCEPTED_WARNING" && (
                        <input type="checkbox" checked={ackIds.has(r.id)} onChange={() => toggleAck(r.id)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={commit} disabled={busy || (accepted.length === 0 && ackIds.size === 0)}>
              {busy ? "Committing…" : `Commit ${accepted.length + ackIds.size} row(s)`}
            </button>
            {rejected.length > 0 && (
              <button className="btn-secondary" onClick={downloadRejected}>
                Download rejected rows (CSV)
              </button>
            )}
            {commitResult && (
              <span className="text-sm text-[color:var(--success)]">
                Committed {commitResult.committed}, skipped {commitResult.skipped}.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
