"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/dates";

interface StateRow {
  id: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
  _count: { districts: number };
}
interface DistrictRow {
  id: string;
  name: string;
  active: boolean;
  state: { id: string; name: string };
}
interface DiseaseRow {
  id: string;
  code: string;
  name: string;
  isCatchAll: boolean;
  approved: boolean;
  active: boolean;
}
interface SpeciesRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
}
interface NodalOfficerRow {
  id: string;
  name: string;
  designation: string;
  mobile: string;
  email: string;
  state: { id: string; name: string };
}
interface CatchAllReport {
  id: string;
  stateName: string;
  remarks: string;
  reportDate: string;
}

export default function MasterDataClient({
  states,
  districts,
  diseases,
  species,
  nodalOfficers,
  catchAllReports,
}: {
  states: StateRow[];
  districts: DistrictRow[];
  diseases: DiseaseRow[];
  species: SpeciesRow[];
  nodalOfficers: NodalOfficerRow[];
  catchAllReports: CatchAllReport[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, body: unknown, method = "POST") {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setError(data.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)]">Master Data</h1>
        <p className="text-sm text-muted">
          Master tables are versioned by effective date. Every submission path resolves against these lists —
          nothing here can be bypassed by manual entry or bulk upload.
        </p>
      </div>

      {error && <div className="card p-3 text-sm text-[color:var(--danger)]">{error}</div>}

      <StatesSection states={states} busy={busy} call={call} />
      <DistrictsSection districts={districts} states={states} busy={busy} call={call} />
      <DiseasesSection diseases={diseases} catchAllReports={catchAllReports} busy={busy} call={call} />
      <SpeciesSection species={species} busy={busy} call={call} />
      <NodalOfficersSection nodalOfficers={nodalOfficers} states={states} busy={busy} call={call} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </div>
  );
}

function StatesSection({
  states,
  busy,
  call,
}: {
  states: StateRow[];
  busy: boolean;
  call: (url: string, body: unknown, method?: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("State");

  async function add() {
    const ok = await call("/api/admin/states", { code, name, type });
    if (ok) {
      setCode("");
      setName("");
    }
  }

  return (
    <Section title={`States/UTs (${states.length})`}>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <input placeholder="Code (e.g. XX)" value={code} onChange={(e) => setCode(e.target.value)} className="w-28" />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="State">State</option>
          <option value="UT">UT</option>
        </select>
        <button className="btn-primary text-xs" disabled={busy || !code || !name} onClick={add}>
          Add State/UT
        </button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Type</th>
            <th>Districts</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {states.map((s) => (
            <tr key={s.id}>
              <td>{s.code}</td>
              <td>{s.name}</td>
              <td>{s.type}</td>
              <td>{s._count.districts}</td>
              <td>
                <span className={`badge ${s.active ? "badge-success" : "badge-danger"}`}>{s.active ? "Active" : "Inactive"}</span>
              </td>
              <td>
                <button
                  className="text-xs text-[color:var(--gt-purple)] underline"
                  disabled={busy}
                  onClick={() => call(`/api/admin/states/${s.id}`, { active: !s.active }, "PATCH")}
                >
                  {s.active ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function DistrictsSection({
  districts,
  states,
  busy,
  call,
}: {
  districts: DistrictRow[];
  states: StateRow[];
  busy: boolean;
  call: (url: string, body: unknown, method?: string) => Promise<boolean>;
}) {
  const [stateId, setStateId] = useState("");
  const [name, setName] = useState("");

  async function add() {
    const ok = await call("/api/admin/districts", { stateId, name });
    if (ok) setName("");
  }

  return (
    <Section title={`Districts (${districts.length})`}>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <select value={stateId} onChange={(e) => setStateId(e.target.value)}>
          <option value="">— select State/UT —</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input placeholder="District name" value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
        <button className="btn-primary text-xs" disabled={busy || !stateId || !name} onClick={add}>
          Add District
        </button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>State/UT</th>
            <th>District</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {districts.map((d) => (
            <tr key={d.id}>
              <td>{d.state.name}</td>
              <td>{d.name}</td>
              <td>
                <span className={`badge ${d.active ? "badge-success" : "badge-danger"}`}>{d.active ? "Active" : "Inactive"}</span>
              </td>
              <td>
                <button
                  className="text-xs text-[color:var(--gt-purple)] underline"
                  disabled={busy}
                  onClick={() => call(`/api/admin/districts/${d.id}`, { active: !d.active }, "PATCH")}
                >
                  {d.active ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          ))}
          {districts.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-muted py-3">
                No districts added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function DiseasesSection({
  diseases,
  catchAllReports,
  busy,
  call,
}: {
  diseases: DiseaseRow[];
  catchAllReports: CatchAllReport[];
  busy: boolean;
  call: (url: string, body: unknown, method?: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  async function add(prefillName?: string) {
    const finalName = prefillName ?? name;
    const finalCode = code || finalName.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const ok = await call("/api/admin/diseases", { code: finalCode, name: finalName });
    if (ok) {
      setCode("");
      setName("");
    }
  }

  return (
    <Section title={`Diseases (${diseases.length})`}>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <input placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} className="w-32" />
        <input placeholder="Disease name" value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
        <button className="btn-primary text-xs" disabled={busy || !name} onClick={() => add()}>
          Add Disease
        </button>
      </div>
      <table className="data-table mb-4">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Catch-all</th>
            <th>Approved</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {diseases.map((d) => (
            <tr key={d.id}>
              <td>{d.code}</td>
              <td>{d.name}</td>
              <td>{d.isCatchAll ? <span className="badge badge-warning">Catch-all</span> : "—"}</td>
              <td>
                <span className={`badge ${d.approved ? "badge-success" : "badge-warning"}`}>
                  {d.approved ? "Approved" : "Pending"}
                </span>
              </td>
              <td>
                <span className={`badge ${d.active ? "badge-success" : "badge-danger"}`}>{d.active ? "Active" : "Inactive"}</span>
              </td>
              <td>
                {!d.isCatchAll && (
                  <button
                    className="text-xs text-[color:var(--gt-purple)] underline"
                    disabled={busy}
                    onClick={() => call(`/api/admin/diseases/${d.id}`, { active: !d.active }, "PATCH")}
                  >
                    {d.active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-xs font-bold text-muted uppercase tracking-wide mb-2">
        Reported under &quot;Any other important disease&quot; — awaiting formalization
      </h3>
      <div className="flex flex-col gap-1.5">
        {catchAllReports.length === 0 && <div className="text-xs text-muted">Nothing pending.</div>}
        {catchAllReports.map((r) => (
          <div key={r.id} className="text-xs flex items-center justify-between border-b border-border pb-1.5">
            <span>
              <strong>{r.stateName}</strong> · {fmtDate(r.reportDate)} · &quot;{r.remarks}&quot;
            </span>
            <button
              className="btn-secondary text-xs px-2 py-1"
              disabled={busy}
              onClick={() => add(r.remarks)}
            >
              Formalize as new disease
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function SpeciesSection({
  species,
  busy,
  call,
}: {
  species: SpeciesRow[];
  busy: boolean;
  call: (url: string, body: unknown, method?: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  async function add() {
    const finalCode = code || name.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const ok = await call("/api/admin/species", { code: finalCode, name });
    if (ok) {
      setCode("");
      setName("");
    }
  }

  return (
    <Section title={`Species (${species.length})`}>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <input placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} className="w-32" />
        <input placeholder="Species name" value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
        <button className="btn-primary text-xs" disabled={busy || !name} onClick={add}>
          Add Species
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {species.map((sp) => (
          <span key={sp.id} className={`badge ${sp.active ? "badge-info" : "badge-danger"}`}>
            {sp.name}
            <button
              className="ml-1 underline"
              disabled={busy}
              onClick={() => call(`/api/admin/species/${sp.id}`, { active: !sp.active }, "PATCH")}
            >
              {sp.active ? "deactivate" : "activate"}
            </button>
          </span>
        ))}
      </div>
    </Section>
  );
}

function NodalOfficersSection({
  nodalOfficers,
  states,
  busy,
  call,
}: {
  nodalOfficers: NodalOfficerRow[];
  states: StateRow[];
  busy: boolean;
  call: (url: string, body: unknown, method?: string) => Promise<boolean>;
}) {
  const [stateId, setStateId] = useState("");
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");

  async function save() {
    const ok = await call("/api/admin/nodal-officers", { stateId, name, designation, mobile, email });
    if (ok) {
      setName("");
      setDesignation("");
      setMobile("");
      setEmail("");
    }
  }

  return (
    <Section title={`Nodal Officers (${nodalOfficers.length})`}>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <select value={stateId} onChange={(e) => setStateId(e.target.value)}>
          <option value="">— select State/UT —</option>
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-40" />
        <input placeholder="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} className="w-48" />
        <input placeholder="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-32" />
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-48" />
        <button className="btn-primary text-xs" disabled={busy || !stateId || !name} onClick={save}>
          Save (add or update)
        </button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>State/UT</th>
            <th>Name</th>
            <th>Designation</th>
            <th>Mobile</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {nodalOfficers.map((n) => (
            <tr key={n.id}>
              <td>{n.state.name}</td>
              <td>{n.name}</td>
              <td>{n.designation}</td>
              <td>{n.mobile}</td>
              <td>{n.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
