"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const DEMO_USERS = [
  { email: "admin@dahd.gov.in", label: "DAHD Admin" },
  { email: "analyst@dahd.gov.in", label: "DAHD Analyst" },
  { email: "sdrno.mh@dahd.gov.in", label: "SDRNO — Maharashtra" },
  { email: "sdrno.rj@dahd.gov.in", label: "SDRNO — Rajasthan" },
  { email: "sdrno.gj@dahd.gov.in", label: "SDRNO — Gujarat" },
  { email: "vet.pune@dahd.gov.in", label: "Field Vet — Pune (Maharashtra)" },
  { email: "lab@dahd.gov.in", label: "Laboratory User" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Password@123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center gt-gradient px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl">
        <div className="hidden md:flex flex-col justify-between p-10 gt-gradient text-white">
          <div>
            <div className="text-xs uppercase tracking-widest opacity-80">Government of India</div>
            <div className="text-sm opacity-80">Department of Animal Husbandry &amp; Dairying</div>
          </div>
          <div>
            <h1 className="text-3xl font-bold leading-tight mb-3">
              National Animal Disease
              <br />
              Daily Monitoring &amp; Reporting System
            </h1>
            <p className="text-sm opacity-85 max-w-sm">
              One shared validation engine for every State/UT submission — replacing manual
              Excel/Google-Sheet reporting with a single source of truth.
            </p>
          </div>
          <div className="text-xs opacity-60">NADMRS · Build 0.1</div>
        </div>

        <div className="bg-white p-8 md:p-10 flex flex-col justify-center">
          <h2 className="text-xl font-bold text-[color:var(--gt-purple-dark)] mb-1">Sign in</h2>
          <p className="text-sm text-muted mb-6">Access is scoped to your State/UT and role.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="text-sm font-medium">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1"
                placeholder="you@dahd.gov.in"
              />
            </label>
            <label className="text-sm font-medium">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1"
              />
            </label>
            {error && <div className="text-sm text-[color:var(--danger)]">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary mt-2">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 border-t border-border pt-4">
            <div className="text-xs font-semibold text-muted mb-2">Demo accounts (password: Password@123)</div>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  onClick={() => setEmail(u.email)}
                  className="text-xs px-2 py-1 rounded-md border border-border hover:border-[color:var(--gt-purple)] hover:text-[color:var(--gt-purple)]"
                  type="button"
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
