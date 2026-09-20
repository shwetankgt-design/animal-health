import { requireRole } from "@/lib/session";
import MonthlyReportClient from "./MonthlyReportClient";

export default async function MonthlyReportPage() {
  await requireRole(["DAHD_ADMIN", "DAHD_ANALYST"]);
  return <MonthlyReportClient />;
}
