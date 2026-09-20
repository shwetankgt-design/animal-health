import { requireRole } from "@/lib/session";
import UploadClient from "./UploadClient";

export default async function UploadPage() {
  const user = await requireRole(["SDRNO"]);
  return <UploadClient stateName={user.stateName ?? ""} />;
}
