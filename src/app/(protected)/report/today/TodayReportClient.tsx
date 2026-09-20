"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Disease = { id: string; name: string; code: string; isCatchAll: boolean };
type Species = { id: string; name: string; code: string };
type District = { id: string; name: string };
type ExistingLine = {
  id: string;
  diseaseId: string;
  districtId: string | null;
  village: string | null;
  block: string | null;
  isNil: boolean;
  probableCases: number;
  labConfirmed: number;
  totalCasesToday: number;
  deathsToday: number;
  cumulativeCases: number;
  activeCases: number;
  cumulativeDeaths: number;
  recoveredCumulative: number;
  vaccinationCumulative: number | null;
  culledCount: number | null;
  controlMeasures: string | null;
  remarks: string | null;
  speciesLinks: { speciesId: string }[];
};

interface Issue {
  field: string;
  rule: string;
  valueReceived: string;
  expected: string;
  severity: "BLOCK" | "WARNING";
}

interface RowState {
  isNil: boolean;
  districtId: string;
  village: string;
  block: string;
  speciesIds: string[];
  probableCases: string;
  labConfirmed: string;
  deathsToday: string;
  cumulativeCases: string;
  activeCases: string;
  cumulativeDeaths: string;
  recoveredCumulative: string;
  vaccinationCumulative: string;
  culledCount: string;
  controlMeasures: string;
  remarks: string;
  decreaseReason: string;
  issues: Issue[];
  saved: "idle" | "saving" | "saved" | "error";
  prior: { cumulativeCases: number; cumulativeDeaths: number } | null;
}

function emptyRow(existing?: ExistingLine): RowState {
  if (existing) {
    return {
      isNil: existing.isNil,
      districtId: existing.districtId ?? "",
      village: existing.village ?? "",
      block: existing.block ?? "",
      speciesIds: existing.speciesLinks.map((s) => s.speciesId),
      probableCases: String(existing.probableCases),
      labConfirmed: String(existing.labConfirmed),
      deathsToday: String(existing.deathsToday),
      cumulativeCases: String(existing.cumulativeCases),
      activeCases: String(existing.activeCases),
      cumulativeDeaths: String(existing.cumulativeDeaths),
      recoveredCumulative: String(existing.recoveredCumulative),
      vaccinationCumulative: existing.vaccinationCumulative != null ? String(existing.vaccinationCumulative) : "",
      culledCount: existing.culledCount != null ? String(existing.culledCount) : "",
      controlMeasures: existing.controlMeasures ?? "",
      remarks: existing.remarks ?? "",
      decreaseReason: "",
      issues: [],
      saved: "saved",
      prior: null,
    };
  }
  return {
    isNil: false,
    districtId: "",
    village: "",
    block: "",
    speciesIds: [],
    probableCases: "",
    labConfirmed: "",
    deathsToday: "",
    cumulativeCases: "",
    activeCases: "",
    cumulativeDeaths: "",
    recoveredCumulative: "",
    vaccinationCumulative: "",
    culledCount: "",
    controlMeasures: "",
    remarks: "",
    decreaseReason: "",
    issues: [],
    saved: "idle",
    prior: null,
  };
}

export default function TodayReportClient({
  reportDateIso,
  diseases,
  species,
  districts,
  existingLines,
  submissionStatus,
  isZeroReport,
  stateName,
  openCorrectionRequests,
}: {
  reportDateIso: string;
  diseases: Disease[];
  species: Species[];
  districts: District[];
  existingLines: ExistingLine[];
  submissionStatus: string;
  isZeroReport: boolean;
  stateName: string;
  openCorrectionRequests: { id: string; reason: string; createdAt: string }[];
}) {
  const router = useRouter();
  const dateStr = reportDateIso.slice(0, 10);
  const locked = submissionStatus === "SUBMITTED";
  const correctionRequested = submissionStatus === "CORRECTION_REQUESTED";
  const [correctionReason, setCorrectionReason] = useState("");

  const initial = useMemo(() => {
    const map: Record<string, RowState> = {};
    for (const d of diseases) {
      const existing = existingLines.find((l) => l.diseaseId === d.id);
      map[d.id] = emptyRow(existing);
    }
    return map;
  }, [diseases, existingLines]);

  const [rows, setRows] = useState<Record<string, RowState>>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [zeroBusy, setZeroBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function updateRow(diseaseId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [diseaseId]: { ...prev[diseaseId], ...patch, saved: "idle" } }));
  }

  function toggleSpecies(diseaseId: string, speciesId: string) {
    setRows((prev) => {
      const row = prev[diseaseId];
      const has = row.speciesIds.includes(speciesId);
      return {
        ...prev,
        [diseaseId]: {
          ...row,
          speciesIds: has ? row.speciesIds.filter((s) => s !== speciesId) : [...row.speciesIds, speciesId],
          saved: "idle",
        },
      };
    });
  }

  function buildInput(row: RowState) {
    return {
      isNil: row.isNil,
      probableCases: row.isNil ? "0" : row.probableCases,
      labConfirmed: row.isNil ? "0" : row.labConfirmed,
      deathsToday: row.isNil ? "0" : row.deathsToday,
      cumulativeCases: row.isNil ? "0" : row.cumulativeCases,
      activeCases: row.isNil ? "0" : row.activeCases,
      cumulativeDeaths: row.isNil ? "0" : row.cumulativeDeaths,
      recoveredCumulative: row.isNil ? "0" : row.recoveredCumulative,
      vaccinationCumulative: row.vaccinationCumulative || null,
      culledCount: row.culledCount || null,
      controlMeasures: row.controlMeasures || null,
      remarks: row.remarks || null,
      decreaseReason: row.decreaseReason || null,
    };
  }

  async function validateDry(diseaseId: string) {
    const row = rows[diseaseId];
    const res = await fetch("/api/report/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDate: dateStr,
        diseaseId,
        input: buildInput(row),
        dryRun: true,
      }),
    });
    const data = await res.json();
    updateRow(diseaseId, { issues: data.result?.issues ?? [], prior: data.prior ?? null });
  }

  async function saveRow(diseaseId: string) {
    const row = rows[diseaseId];
    if (correctionRequested && !correctionReason.trim()) {
      updateRow(diseaseId, {
        issues: [
          {
            field: "reason",
            rule: "DAHD has requested a correction on this day's report. Enter a reason above before saving.",
            valueReceived: "(no reason provided)",
            expected: "a reason for the correction",
            severity: "BLOCK",
          },
        ],
      });
      return;
    }
    updateRow(diseaseId, { saved: "saving" });
    const res = await fetch("/api/report/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDate: dateStr,
        diseaseId,
        districtId: row.districtId || null,
        village: row.village || null,
        block: row.block || null,
        speciesIds: row.speciesIds,
        input: buildInput(row),
        reason: correctionRequested ? correctionReason.trim() : undefined,
      }),
    });
    const data = await res.json();
    const result = data.result;
    if (result?.status === "REJECTED") {
      updateRow(diseaseId, { issues: result.issues, saved: "error" });
    } else {
      updateRow(diseaseId, { issues: result?.issues ?? [], saved: "saved" });
    }
  }

  async function declareStateZero() {
    setZeroBusy(true);
    await fetch("/api/report/zero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportDate: dateStr }),
    });
    setZeroBusy(false);
    router.refresh();
  }

  async function submitDay() {
    setSubmitBusy(true);
    setSubmitError(null);
    const res = await fetch("/api/report/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportDate: dateStr }),
    });
    const data = await res.json();
    setSubmitBusy(false);
    if (data.error) setSubmitError(data.error);
    else router.refresh();
  }

  const filledCount = Object.values(rows).filter((r) => r.saved === "saved").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)]">Today&apos;s Report — {stateName}</h1>
          <div className="text-sm text-muted">
            Reporting date: <strong>{dateStr}</strong> ·{" "}
            {locked ? (
              <span className="badge badge-success">Submitted &amp; locked</span>
            ) : correctionRequested ? (
              <span className="badge badge-danger">Correction requested by DAHD</span>
            ) : (
              <span className="badge badge-warning">Draft — not yet submitted</span>
            )}
            {isZeroReport && <span className="badge badge-info ml-2">Nil report declared</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            defaultValue={dateStr}
            className="text-sm"
            onChange={(e) => router.push(`/report/today?date=${e.target.value}`)}
          />
          {!locked && (
            <button className="btn-secondary text-sm" onClick={declareStateZero} disabled={zeroBusy}>
              {zeroBusy ? "Declaring…" : "Nil report for today (all diseases)"}
            </button>
          )}
        </div>
      </div>

      {correctionRequested && (
        <div className="card p-4 border-l-4" style={{ borderLeftColor: "var(--danger)" }}>
          <h2 className="text-sm font-bold text-[color:var(--danger)] mb-2">
            DAHD has requested a correction on this day&apos;s report
          </h2>
          <ul className="text-sm flex flex-col gap-1 mb-3">
            {openCorrectionRequests.map((c) => (
              <li key={c.id}>
                <span className="text-muted">{new Date(c.createdAt).toLocaleString("en-IN")}:</span> {c.reason}
              </li>
            ))}
          </ul>
          <label className="text-xs font-medium flex flex-col gap-1 max-w-lg">
            Your reason for this correction (required to save any changes and to resubmit)
            <input
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. corrected data-entry error in Cumulative cases for FMD"
            />
          </label>
        </div>
      )}

      <div className="text-xs text-muted">
        {filledCount} of {diseases.length} master-list diseases saved for this date. Every disease must be
        addressed (filled in or marked NIL) before you can submit.
      </div>

      <div className="flex flex-col gap-2">
        {diseases.map((d) => {
          const row = rows[d.id];
          const isOpen = expanded === d.id;
          const blockIssues = row.issues.filter((i) => i.severity === "BLOCK");
          const warnIssues = row.issues.filter((i) => i.severity === "WARNING");
          return (
            <div key={d.id} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : d.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">{d.name}</span>
                  {row.isNil && <span className="badge badge-info">NIL</span>}
                  {row.saved === "saved" && !row.isNil && (
                    <span className="badge badge-success">
                      Saved · Total today: {(Number(row.probableCases) || 0) + (Number(row.labConfirmed) || 0)}
                    </span>
                  )}
                  {blockIssues.length > 0 && <span className="badge badge-danger">{blockIssues.length} error(s)</span>}
                  {warnIssues.length > 0 && <span className="badge badge-warning">{warnIssues.length} warning(s)</span>}
                </div>
                <span className="text-xs text-muted">{isOpen ? "Collapse ▲" : "Expand ▼"}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-border pt-3 flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium w-fit">
                    <input
                      type="checkbox"
                      checked={row.isNil}
                      disabled={locked}
                      onChange={(e) => updateRow(d.id, { isNil: e.target.checked })}
                    />
                    NIL / No new case for this disease today
                  </label>

                  {!row.isNil && (
                    <>
                      <div>
                        <div className="text-xs font-semibold text-muted mb-1">Species affected</div>
                        <div className="flex flex-wrap gap-1.5">
                          {species.map((sp) => (
                            <button
                              type="button"
                              key={sp.id}
                              disabled={locked}
                              onClick={() => toggleSpecies(d.id, sp.id)}
                              className={`text-xs px-2 py-1 rounded-md border ${
                                row.speciesIds.includes(sp.id)
                                  ? "bg-[color:var(--gt-purple)] text-white border-[color:var(--gt-purple)]"
                                  : "border-border"
                              }`}
                            >
                              {sp.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid md:grid-cols-3 gap-3">
                        <NumField
                          label="Probable / Clinically Infected"
                          value={row.probableCases}
                          issues={row.issues}
                          field="probableCases"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { probableCases: v })}
                          onBlur={() => validateDry(d.id)}
                        />
                        <NumField
                          label="Lab Confirmed"
                          value={row.labConfirmed}
                          issues={row.issues}
                          field="labConfirmed"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { labConfirmed: v })}
                          onBlur={() => validateDry(d.id)}
                        />
                        <div>
                          <div className="text-xs font-semibold text-muted mb-1">Total cases today (computed)</div>
                          <input
                            disabled
                            value={(Number(row.probableCases) || 0) + (Number(row.labConfirmed) || 0)}
                            className="w-full bg-gray-50"
                          />
                        </div>
                        <NumField
                          label="Deaths that day"
                          value={row.deathsToday}
                          issues={row.issues}
                          field="deathsToday"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { deathsToday: v })}
                          onBlur={() => validateDry(d.id)}
                        />
                        <NumField
                          label="Cumulative cases since 1 Jan"
                          value={row.cumulativeCases}
                          issues={row.issues}
                          field="cumulativeCases"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { cumulativeCases: v })}
                          onBlur={() => validateDry(d.id)}
                          hint={row.prior ? `Yesterday: ${row.prior.cumulativeCases}` : undefined}
                        />
                        <NumField
                          label="Active cases as on date"
                          value={row.activeCases}
                          issues={row.issues}
                          field="activeCases"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { activeCases: v })}
                          onBlur={() => validateDry(d.id)}
                        />
                        <NumField
                          label="Cumulative deaths since 1 Jan"
                          value={row.cumulativeDeaths}
                          issues={row.issues}
                          field="cumulativeDeaths"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { cumulativeDeaths: v })}
                          onBlur={() => validateDry(d.id)}
                          hint={row.prior ? `Yesterday: ${row.prior.cumulativeDeaths}` : undefined}
                        />
                        <NumField
                          label="Recovered animals (cumulative)"
                          value={row.recoveredCumulative}
                          issues={row.issues}
                          field="recoveredCumulative"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { recoveredCumulative: v })}
                          onBlur={() => validateDry(d.id)}
                        />
                        <NumField
                          label="Vaccination since 1 Jan (optional)"
                          value={row.vaccinationCumulative}
                          issues={row.issues}
                          field="vaccinationCumulative"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { vaccinationCumulative: v })}
                          onBlur={() => validateDry(d.id)}
                        />
                        <NumField
                          label="Animals culled/slaughtered (optional)"
                          value={row.culledCount}
                          issues={row.issues}
                          field="culledCount"
                          disabled={locked}
                          onChange={(v) => updateRow(d.id, { culledCount: v })}
                          onBlur={() => validateDry(d.id)}
                        />
                      </div>

                      {(row.issues.some((i) => i.field === "cumulativeCases" || i.field === "cumulativeDeaths") &&
                        warnIssues.length > 0) && (
                        <label className="text-xs font-medium flex flex-col gap-1">
                          Reason for decrease from yesterday (required to save)
                          <input
                            value={row.decreaseReason}
                            disabled={locked}
                            onChange={(e) => updateRow(d.id, { decreaseReason: e.target.value })}
                            placeholder="e.g. data-entry correction confirmed by district office"
                          />
                        </label>
                      )}

                      <div className="grid md:grid-cols-3 gap-3">
                        <label className="text-xs font-medium flex flex-col gap-1">
                          District
                          <select
                            value={row.districtId}
                            disabled={locked}
                            onChange={(e) => updateRow(d.id, { districtId: e.target.value })}
                          >
                            <option value="">— select —</option>
                            {districts.map((dist) => (
                              <option key={dist.id} value={dist.id}>
                                {dist.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-medium flex flex-col gap-1">
                          Block
                          <input value={row.block} disabled={locked} onChange={(e) => updateRow(d.id, { block: e.target.value })} />
                        </label>
                        <label className="text-xs font-medium flex flex-col gap-1">
                          Village / epicentre
                          <input
                            value={row.village}
                            disabled={locked}
                            onChange={(e) => updateRow(d.id, { village: e.target.value })}
                          />
                        </label>
                      </div>

                      <label className="text-xs font-medium flex flex-col gap-1">
                        Control measures undertaken
                        <textarea
                          rows={2}
                          value={row.controlMeasures}
                          disabled={locked}
                          onChange={(e) => updateRow(d.id, { controlMeasures: e.target.value })}
                        />
                      </label>
                      <label className="text-xs font-medium flex flex-col gap-1">
                        Remarks
                        <textarea
                          rows={2}
                          value={row.remarks}
                          disabled={locked}
                          onChange={(e) => updateRow(d.id, { remarks: e.target.value })}
                        />
                      </label>
                    </>
                  )}

                  {row.issues.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {row.issues.map((iss, idx) => (
                        <div
                          key={idx}
                          className={`text-xs rounded-md px-3 py-2 ${
                            iss.severity === "BLOCK" ? "badge-danger bg-[color:var(--danger-bg)]" : "bg-[color:var(--warning-bg)]"
                          }`}
                          style={{ color: iss.severity === "BLOCK" ? "var(--danger)" : "var(--warning)" }}
                        >
                          <strong>{iss.field}:</strong> {iss.rule} Received: <code>{iss.valueReceived}</code>. Expected:{" "}
                          {iss.expected}.
                        </div>
                      ))}
                    </div>
                  )}

                  {!locked && (
                    <div>
                      <button className="btn-primary text-sm" onClick={() => saveRow(d.id)} disabled={row.saved === "saving"}>
                        {row.saved === "saving" ? "Saving…" : "Save row"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!locked && (
        <div className="card p-4 flex items-center justify-between">
          <div className="text-sm text-muted">
            Submitting locks today&apos;s report. Later changes require an edit-with-reason correction.
          </div>
          <div className="flex items-center gap-3">
            {submitError && <span className="text-xs text-[color:var(--danger)]">{submitError}</span>}
            <button className="btn-primary" onClick={submitDay} disabled={submitBusy}>
              {submitBusy ? "Submitting…" : "Submit & lock today's report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  onBlur,
  issues,
  field,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  issues: Issue[];
  field: string;
  disabled?: boolean;
  hint?: string;
}) {
  const fieldIssue = issues.find((i) => i.field === field);
  return (
    <label className="text-xs font-medium flex flex-col gap-1">
      {label} {hint && <span className="text-muted font-normal">({hint})</span>}
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="0 or NIL"
        className={fieldIssue ? (fieldIssue.severity === "BLOCK" ? "field-error" : "field-warning") : ""}
      />
    </label>
  );
}
