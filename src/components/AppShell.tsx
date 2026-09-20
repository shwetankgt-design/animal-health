import Link from "next/link";
import { auth, signOut } from "@/auth";
import { ROLE_LABELS } from "@/lib/session";

const NAV: { href: string; label: string; roles: string[] }[] = [
  { href: "/", label: "Dashboard", roles: ["FIELD_VET", "SDRNO", "LAB_USER", "DAHD_ADMIN", "DAHD_ANALYST"] },
  { href: "/monitoring", label: "Monitoring", roles: ["DAHD_ADMIN", "DAHD_ANALYST"] },
  { href: "/report/today", label: "Today's Report", roles: ["SDRNO", "FIELD_VET"] },
  { href: "/report/upload", label: "Bulk Upload", roles: ["SDRNO"] },
  { href: "/lab", label: "Lab Confirmations", roles: ["LAB_USER"] },
  { href: "/submissions", label: "Submission History", roles: ["SDRNO", "DAHD_ADMIN", "DAHD_ANALYST"] },
  { href: "/alerts", label: "Alerts", roles: ["DAHD_ADMIN", "DAHD_ANALYST"] },
  { href: "/reports/monthly", label: "Monthly Report", roles: ["DAHD_ADMIN", "DAHD_ANALYST"] },
  { href: "/admin/master-data", label: "Master Data", roles: ["DAHD_ADMIN"] },
];

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="gt-gradient text-white">
        <div className="max-w-[1400px] mx-auto px-5 py-2 flex items-center justify-between text-xs opacity-90">
          <span>Government of India · Department of Animal Husbandry &amp; Dairying</span>
          <span>राष्ट्रीय पशु रोग निगरानी प्रणाली</span>
        </div>
        <div className="max-w-[1400px] mx-auto px-5 pb-3 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold leading-tight">NADMRS</div>
            <div className="text-[11px] opacity-80 -mt-0.5">
              National Animal Disease Daily Monitoring &amp; Reporting System
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right text-xs leading-tight">
                <div className="font-semibold">{user.name}</div>
                <div className="opacity-75">
                  {ROLE_LABELS[user.role] ?? user.role}
                  {user.stateName ? ` · ${user.stateName}` : ""}
                </div>
              </div>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="text-xs px-3 py-1.5 rounded-md bg-white/15 hover:bg-white/25 border border-white/30"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
        {user && (
          <nav className="max-w-[1400px] mx-auto px-5 flex gap-1 overflow-x-auto border-t border-white/15">
            {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-xs px-3 py-2 whitespace-nowrap hover:bg-white/10 border-b-2 border-transparent hover:border-[color:var(--gt-orange)]"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-5 py-6">{children}</main>
      <footer className="text-center text-[11px] text-muted py-4 border-t border-border">
        NADMRS · Prototype build · Department of Animal Husbandry &amp; Dairying, Government of India
      </footer>
    </div>
  );
}
