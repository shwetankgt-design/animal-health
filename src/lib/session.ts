import { auth } from "@/auth";
import { redirect } from "next/navigation";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function requireRole(roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

export const ROLE_LABELS: Record<string, string> = {
  FIELD_VET: "Field Veterinary / District Authority",
  SDRNO: "State Disease Reporting Nodal Officer",
  LAB_USER: "Laboratory User",
  DAHD_ADMIN: "DAHD Admin",
  DAHD_ANALYST: "DAHD Analyst",
};
