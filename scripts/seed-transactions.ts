import { PrismaClient, SubmissionStatus } from "@prisma/client";
import { randomUUID } from "crypto";

// Bulk dummy Submission generator. All rows get ids prefixed "dmy_" so they can be
// removed with: DELETE ... WHERE id LIKE 'dmy_%' (see scripts/clear-dummy-transactions.ts).
const TARGET = Number(process.argv[2] ?? 5000);
const prisma = new PrismaClient();

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const id = () => "dmy_" + randomUUID().replace(/-/g, "");
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function pickStatus(): SubmissionStatus {
  const r = Math.random();
  if (r < 0.65) return "SUBMITTED";
  if (r < 0.85) return "DRAFT";
  return "CORRECTION_REQUESTED";
}

async function main() {
  console.time("seed");
  const [states, diseases, species, users, districts, existing] = await Promise.all([
    prisma.stateUT.findMany({ where: { active: true } }),
    prisma.disease.findMany({ where: { active: true } }),
    prisma.species.findMany({ where: { active: true } }),
    prisma.user.findMany({ where: { active: true } }),
    prisma.district.findMany({ where: { active: true } }),
    prisma.submission.findMany({ select: { stateId: true, reportDate: true } }),
  ]);
  const taken = new Set(existing.map((e) => `${e.stateId}|${e.reportDate.toISOString().slice(0, 10)}`));
  const admins = users.filter((u) => u.role === "DAHD_ADMIN" || u.role === "DAHD_ANALYST");
  const submitters = users.filter((u) => u.role === "SDRNO" || u.role === "FIELD_VET");
  const districtsByState = new Map<string, typeof districts>();
  for (const d of districts) districtsByState.set(d.stateId, [...(districtsByState.get(d.stateId) ?? []), d]);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const subs: any[] = [], lines: any[] = [], links: any[] = [], corrections: any[] = [], audits: any[] = [];
  const counts: Record<string, number> = {};

  for (let day = 1; subs.length < TARGET && day < 2000; day++) {
    const reportDate = new Date(today);
    reportDate.setUTCDate(reportDate.getUTCDate() - day);
    for (const state of states) {
      if (subs.length >= TARGET) break;
      if (taken.has(`${state.id}|${reportDate.toISOString().slice(0, 10)}`)) continue;

      const status = pickStatus();
      counts[status] = (counts[status] ?? 0) + 1;
      const submitter = submitters.find((u) => u.stateId === state.id) ?? pick(submitters);
      const submittedAt = new Date(reportDate.getTime() + (16 + rnd(6)) * 3600e3 + rnd(3600) * 1000);
      const sid = id();
      subs.push({
        id: sid,
        stateId: state.id,
        reportDate,
        status,
        submittedById: status === "DRAFT" ? null : submitter.id,
        submittedAt: status === "DRAFT" ? null : submittedAt,
        source: Math.random() < 0.25 ? "BULK_UPLOAD" : "MANUAL",
        createdAt: new Date(reportDate.getTime() + 9 * 3600e3),
        updatedAt: status === "DRAFT" ? new Date(reportDate.getTime() + 12 * 3600e3) : submittedAt,
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

      if (status !== "DRAFT") {
        audits.push({
          id: id(), submissionId: sid, entityType: "Submission", entityId: sid, action: "SUBMIT",
          fieldChanges: "{}", actorUserId: submitter.id, createdAt: submittedAt,
        });
      }
      if (status === "CORRECTION_REQUESTED" && admins.length) {
        const admin = pick(admins);
        corrections.push({
          id: id(), submissionId: sid, requestedById: admin.id, status: "OPEN",
          reason: pick(["Cumulative cases lower than previous day", "Deaths exceed confirmed cases", "Missing district details", "Species data inconsistent"]),
          createdAt: new Date(submittedAt.getTime() + 3600e3 * (1 + rnd(20))),
        });
      }
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
  console.timeEnd("seed");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
