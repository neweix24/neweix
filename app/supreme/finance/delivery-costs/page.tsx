import { requireStaff } from "@/lib/auth";
import SupremeDeliveryCostsManager from "@/features/supreme/supreme-delivery-costs-manager";

export const dynamic = "force-dynamic";

export default async function SupremeDeliveryCostsPage() {
  await requireStaff(["supreme"]);
  return <SupremeDeliveryCostsManager />;
}
