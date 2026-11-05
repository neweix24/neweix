import { requireStaff } from "@/lib/auth";
import SupremeDashboard from "@/features/supreme/supreme-dashboard";

export const dynamic = "force-dynamic";

export default async function SupremePage() {
  // Keep the page-level gate in addition to the protected Supreme layout.
  await requireStaff(["supreme"]);

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <SupremeDashboard />
    </main>
  );
}
