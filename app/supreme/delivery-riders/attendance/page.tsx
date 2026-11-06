import { requireStaff } from "@/lib/auth";
import SupremeDeliveryRiderAttendance from "@/features/supreme/supreme-delivery-rider-attendance";

export const dynamic = "force-dynamic";

export default async function SupremeDeliveryRiderAttendancePage() {
  await requireStaff(["supreme"]);
  return <SupremeDeliveryRiderAttendance />;
}
