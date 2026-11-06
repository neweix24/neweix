import { requireStaff } from "@/lib/auth";
import SupremeExpensesManager from "@/features/supreme/supreme-expenses-manager";

export const dynamic = "force-dynamic";

export default async function SupremeExpensesPage() {
  await requireStaff(["supreme"]);
  return <SupremeExpensesManager />;
}
