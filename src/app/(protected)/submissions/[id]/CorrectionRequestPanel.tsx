"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CorrectionRequestRow {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  requestedByName: string;
}

export default function CorrectionRequestPanel({
  submissionId,
  submissionStatus,
  canRequest,
  requests,
}: {
  submissionId: string;
  submissionStatus: string;
  canRequest: boolean;
  requests: CorrectionRequestRow[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, reason }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    setReason("");
    router.refresh();
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-2">Correction Requests</h2>
      <p className="text-xs text-muted mb-3">
        DAHD Admin cannot edit a State&apos;s submitted figures directly — only request a correction. The
        State&apos;s Nodal Officer then edits with a reason, preserving accountability.
      </p>

      {canRequest && submissionStatus === "SUBMITTED" && (
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <label className="text-xs font-medium flex flex-col gap-1 flex-1 min-w-[240px]">
            Reason for requesting a correction
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cumulative cases for FMD looks inconsistent with yesterday's figure" />
          </label>
          <button className="btn-primary text-xs" disabled={busy || !reason.trim()} onClick={submit}>
            {busy ? "Sending…" : "Request correction"}
          </button>
        </div>
      )}
      {canRequest && submissionStatus === "CORRECTION_REQUESTED" && (
        <div className="text-xs text-[color:var(--warning)] mb-3">
          A correction request is already open on this submission — waiting for the State to respond.
        </div>
      )}
      {error && <div className="text-xs text-[color:var(--danger)] mb-3">{error}</div>}

      <div className="flex flex-col gap-2">
        {requests.map((r) => (
          <div key={r.id} className="text-xs border-b border-border pb-2">
            <div className="flex justify-between">
              <span className={`badge ${r.status === "OPEN" ? "badge-danger" : "badge-success"}`}>{r.status}</span>
              <span className="text-muted">{new Date(r.createdAt).toLocaleString("en-IN")}</span>
            </div>
            <div className="mt-1">
              {r.reason} — requested by {r.requestedByName}
              {r.resolvedAt && ` · resolved ${new Date(r.resolvedAt).toLocaleString("en-IN")}`}
            </div>
          </div>
        ))}
        {requests.length === 0 && <div className="text-xs text-muted">No correction requests on this submission.</div>}
      </div>
    </div>
  );
}
