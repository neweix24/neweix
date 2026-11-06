import { requireStaff } from "@/lib/auth";
import SupremeDeliveryRidersManager from "@/features/supreme/supreme-delivery-riders-manager";
export const dynamic = "force-dynamic";
export default async function SupremeDeliveryRidersPage(){await requireStaff(["supreme"]);return <SupremeDeliveryRidersManager/>;}
