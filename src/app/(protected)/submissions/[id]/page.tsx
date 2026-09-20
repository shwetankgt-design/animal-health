import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/dates";
import { notFound, redirect } from "next/navigation";
import CorrectionRequestPanel from "./CorrectionRequestPanel";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      state: true,
      submittedBy: true,
      lines: {
        include: { disease: true, district: true, speciesLinks: { include: { species: true } } },
        orderBy: { disease: { name: "asc" } },
      },
      auditLogs: { include: { actorUser: true }, orderBy: { createdAt: "desc" } },
      correctionRequests: { include: { requestedBy: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!submission) notFound();

  const isNational = user.role === "DAHD_ADMIN" || user.role === "DAHD_ANALYST";
  if (!isNational && submission.stateId !== user.stateId) redirect("/submissions");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)]">
          {submission.state.name} — {fmtDate(submission.reportDate)}
        </h1>
        <div className="text-sm text-muted">
          Status:{" "}
          <span
            className={`badge ${
              submission.status === "SUBMITTED" ? "badge-success" : submission.status === "CORRECTION_REQUESTED" ? "badge-danger" : "badge-warning"
            }`}
          >
            {submission.status}
          </span>
          {submission.submittedBy && ` · Submitted by ${submission.submittedBy.name}`}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Disease</th>
              <th>Species</th>
              <th>District</th>
              <th>Probable</th>
              <th>Lab Confirmed</th>
              <th>Total today</th>
              <th>Deaths today</th>
              <th>Cumulative cases</th>
              <th>Active</th>
              <th>Cumulative deaths</th>
              <th>Recovered</th>
            </tr>
          </thead>
          <tbody>
            {submission.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.disease.name} {l.isNil && <span className="badge badge-info ml-1">NIL</span>}
                </td>
                <td>{l.speciesLinks.map((s) => s.species.name).join(", ") || "—"}</td>
                <td>{l.district?.name ?? "—"}</td>
                <td>{l.probableCases}</td>
                <td>{l.labConfirmed}</td>
                <td>{l.totalCasesToday}</td>
                <td>{l.deathsToday}</td>
                <td>{l.cumulativeCases}</td>
                <td>{l.activeCases}</td>
                <td>{l.cumulativeDeaths}</td>
                <td>{l.recoveredCumulative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-bold text-muted uppercase tracking-wide mb-2">Audit Trail</h2>
        <div className="flex flex-col gap-2">
          {submission.auditLogs.map((a) => (
            <div key={a.id} className="text-xs border-b border-border pb-2">
              <div className="flex justify-between">
                <span className="font-semibold">
                  {a.action} · {a.entityType}
                </span>
                <span className="text-muted">{new Date(a.createdAt).toLocaleString("en-IN")}</span>
              </div>
              <div className="text-muted">By {a.actorUser.name}{a.reason ? ` — Reason: ${a.reason}` : ""}</div>
            </div>
          ))}
          {submission.auditLogs.length === 0 && <div className="text-xs text-muted">No audit entries.</div>}
        </div>
      </div>

      <CorrectionRequestPanel
        submissionId={submission.id}
        submissionStatus={submission.status}
        canRequest={user.role === "DAHD_ADMIN"}
        requests={submission.correctionRequests.map((r) => ({
          id: r.id,
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
          requestedByName: r.requestedBy.name,
        }))}
      />
    </div>
  );
}
