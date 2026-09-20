import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/dates";
import Link from "next/link";

export default async function SubmissionsPage() {
  const user = await requireUser();
  const isNational = user.role === "DAHD_ADMIN" || user.role === "DAHD_ANALYST";

  const submissions = await prisma.submission.findMany({
    where: isNational ? {} : { stateId: user.stateId ?? undefined },
    include: { state: true, lines: true, submittedBy: true },
    orderBy: { reportDate: "desc" },
    take: 60,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-[color:var(--gt-purple-dark)]">Submission History</h1>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              {isNational && <th>State/UT</th>}
              <th>Status</th>
              <th>Disease rows</th>
              <th>Total cases</th>
              <th>Submitted by</th>
              <th>Submitted at</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td>{fmtDate(s.reportDate)}</td>
                {isNational && <td>{s.state.name}</td>}
                <td>
                  <span className={`badge ${s.status === "SUBMITTED" ? "badge-success" : "badge-warning"}`}>
                    {s.status}
                  </span>
                </td>
                <td>{s.lines.length}</td>
                <td>{s.lines.reduce((a, l) => a + l.totalCasesToday, 0)}</td>
                <td>{s.submittedBy?.name ?? "—"}</td>
                <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString("en-IN") : "—"}</td>
                <td>
                  <Link href={`/submissions/${s.id}`} className="text-xs text-[color:var(--gt-purple)] underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {submissions.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-6">
                  No submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
