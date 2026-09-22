import { PrismaClient, SubmissionStatus } from "@prisma/client";
import { randomUUID } from "crypto";

// Second dummy batch: guarantees every active state has a submission in each
// status (DRAFT, SUBMITTED, CORRECTION_REQUESTED) among recent dates, then tops
// up with more random dummy rows until TARGET new submissions are created.
// Ids are prefixed "dmy_" like scripts/seed-transactions.ts, so both batches are
// removed together by scripts/clear-dummy-transactions.ts.
const TARGET = Number(process.argv[2] ?? 1000);
const prisma = new PrismaClient();

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const id = () => "dmy_" + randomUUID().replace(/-/g, "");
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const STATUSES: SubmissionStatus[] = ["DRAFT", "SUBMITTED", "CORRECTION_REQUESTED"];

async function main() {
  console.time("seed2");
  const [states, diseases, species, users, districts, existing] = await Promise.all([
    prisma.stateUT.findMany({ where: { active: true } }),
    prisma.disease.findMany({ where: { active: true } }),
    prisma.species.findMany({ where: { active: true } }),
    prisma.user.findMany({ where: { active: true } }),
    prisma.district.findMany({ where: { active: true } }),
    prisma.submission.findMany({ select: { id: true, stateId: true, reportDate: true, status: true } }),
  ]);
  const taken = new Set(existing.map((e) => `${e.stateId}|${e.reportDate.toISOString().slice(0, 10)}`));
  const admins = users.filter((u) => u.role === "DAHD_ADMIN" || u.role === "DAHD_ANALYST");
  const submitters = users.filter((u) => u.role === "SDRNO" || u.role === "FIELD_VET");
  const districtsByState = new Map<string, typeof districts>();
  for (const d of districts) districtsByState.set(d.stateId, [...(districtsByState.get(d.stateId) ?? []), d]);
  // Existing status coverage per state, in a recent window (last 10 days) — that's
  // what the dashboards' default filters actually look at.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const recentCutoff = new Date(today);
  recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 10);
  const recentCoverage = new Map<string, Set<SubmissionStatus>>();
  for (const e of existing) {
    if (e.reportDate < recentCutoff) continue;
    if (!recentCoverage.has(e.stateId)) recentCoverage.set(e.stateId, new Set());
    recentCoverage.get(e.stateId)!.add(e.status);
  }

  const subs: any[] = [], lines: any[] = [], links: any[] = [], corrections: any[] = [], audits: any[] = [];
  const counts: Record<string, number> = {};

  function findFreeDate(stateId: string, preferToday: boolean): Date | null {
    if (preferToday) {
      const key = `${stateId}|${today.toISOString().slice(0, 10)}`;
      if (!taken.has(key)) return new Date(today);
    }
    for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - dayOffset);
      const key = `${stateId}|${d.toISOString().slice(0, 10)}`;
      if (!taken.has(key)) return d;
    }
    return null;
  }

  function addSubmission(state: (typeof states)[number], status: SubmissionStatus, reportDate: Date) {
    taken.add(`${state.id}|${reportDate.toISOString().slice(0, 10)}`);
    counts[status] = (counts[status] ?? 0) + 1;
    const submitter = submitters.find((u) => u.stateId === state.id) ?? pick(submitters);
    const submittedAt = status === "DRAFT" ? null : new Date(reportDate.getTime() + (16 + rnd(6)) * 3600e3 + rnd(3600) * 1000);
    const sid = id();
    subs.push({
      id: sid,
      stateId: state.id,
      reportDate,
      status,
      submittedById: status === "DRAFT" ? null : submitter.id,
      submittedAt,
      source: Math.random() < 0.25 ? "BULK_UPLOAD" : "MANUAL",
      createdAt: new Date(reportDate.getTime() + 9 * 3600e3),
      updatedAt: submittedAt ?? new Date(reportDate.getTime() + 12 * 3600e3),
    });

    const used = new Set<string>();
    const n = 1 + rnd(3);
    for (let i = 0; i < n; i++) {
      const disease = pick(diseases);
      if (used.has(disease.id)) continue;
      used.add(disease.id);
      const nil = Math.random() < 0.1;
      const probable = nil ? 0 : rnd(80);
      const lab = nil ? 0 : Math.floor(probable * Math.random() * 0.7);
      const deaths = nil ? 0 : Math.floor((probable + lab) * Math.random() * 0.15);
      const cum = nil ? rnd(300) : 100 + rnd(2000);
      const active = Math.floor(cum * (0.1 + Math.random() * 0.4));
      const cumDeaths = Math.floor(cum * Math.random() * 0.08);
      const ds = districtsByState.get(state.id);
      const lid = id();
      lines.push({
        id: lid,
        submissionId: sid,
        diseaseId: disease.id,
        districtId: ds?.length ? pick(ds).id : null,
        isNil: nil,
        probableCases: probable,
        labConfirmed: lab,
        totalCasesToday: probable + lab,
        deathsToday: deaths,
        cumulativeCases: cum,
        activeCases: active,
        cumulativeDeaths: cumDeaths,
        recoveredCumulative: Math.max(0, cum - active - cumDeaths),
        vaccinationCumulative: Math.floor(cum * Math.random()),
        culledCount: Math.floor(active * Math.random() * 0.2),
        controlMeasures: pick(["Quarantine", "Vaccination", "Ring vaccination", "Movement restriction", "Culling; Disinfection"]),
        remarks: pick(["Routine", "Under observation", "Cluster reported", "Follow-up pending", null as any]),
      });
      for (const sp of new Set([pick(species), pick(species)])) links.push({ id: id(), lineId: lid, speciesId: sp.id });
    }

    if (status !== "DRAFT" && submittedAt) {
      audits.push({
        id: id(), submissionId: sid, entityType: "Submission", entityId: sid, action: "SUBMIT",
        fieldChanges: "{}", actorUserId: submitter.id, createdAt: submittedAt,
      });
    }
    if (status === "CORRECTION_REQUESTED" && admins.length && submittedAt) {
      const admin = pick(admins);
      corrections.push({
        id: id(), submissionId: sid, requestedById: admin.id, status: "OPEN",
        reason: pick(["Cumulative cases lower than previous day", "Deaths exceed confirmed cases", "Missing district details", "Species data inconsistent"]),
        createdAt: new Date(submittedAt.getTime() + 3600e3 * (1 + rnd(20))),
      });
    }
  }

  // Pass 1: guarantee every state has DRAFT, SUBMITTED and CORRECTION_REQUESTED
  // among the last 10 days, preferring today's date for the first gap filled.
  for (const state of states) {
    const have = recentCoverage.get(state.id) ?? new Set<SubmissionStatus>();
    let first = true;
    for (const status of STATUSES) {
      if (have.has(status)) continue;
      const d = findFreeDate(state.id, first);
      first = false;
      if (!d) continue; // no free date left in the window; skip rather than collide
      addSubmission(state, status, d);
      have.add(status);
    }
  }
  console.log(`Guaranteed coverage: ${subs.length} submissions so far`, counts);

  // Pass 2: top up with more random dummy rows (older dates) until TARGET new rows exist.
  for (let day = 1; subs.length < TARGET && day < 2000; day++) {
    const reportDate = new Date(today);
    reportDate.setUTCDate(reportDate.getUTCDate() - day);
    for (const state of states) {
      if (subs.length >= TARGET) break;
      const key = `${state.id}|${reportDate.toISOString().slice(0, 10)}`;
      if (taken.has(key)) continue;
      const r = Math.random();
      const status: SubmissionStatus = r < 0.65 ? "SUBMITTED" : r < 0.85 ? "DRAFT" : "CORRECTION_REQUESTED";
      addSubmission(state, status, reportDate);
    }
  }

  console.log(`Prepared ${subs.length} submissions, ${lines.length} lines`, counts);
  const ins = async (label: string, model: any, rows: any[], size = 1000) => {
    for (const c of chunk(rows, size)) await model.createMany({ data: c, skipDuplicates: true });
    console.log(`  inserted ${rows.length} ${label}`);
  };
  await ins("submissions", prisma.submission, subs);
  await ins("lines", prisma.submissionLine, lines);
  await ins("species links", prisma.submissionLineSpecies, links);
  await ins("correction requests", prisma.correctionRequest, corrections);
  await ins("audit logs", prisma.auditLog, audits);
  console.timeEnd("seed2");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
