import { requireStaff } from "@/lib/auth";
import StaffDashboard from "@/features/staff/staff-dashboard";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requireStaff(["staff"]);
  return <StaffDashboard />;
}
