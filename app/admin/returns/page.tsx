import { requireStaff } from "@/lib/auth";
import ReturnsManager from "@/features/admin/returns-manager";

export const dynamic = "force-dynamic";

export default async function AdminReturnsPage() {
  await requireStaff(["supreme", "admin"]);
  return <ReturnsManager />;
}
