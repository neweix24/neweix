import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import SupremeManagerNominations from "./SupremeManagerNominations";

export const dynamic = "force-dynamic";

export default async function SupremeManagerNominationsPage() {
  await requireStaff(["supreme"]);
  return (
    <main className="hero auth-page premium-supreme-page">
      <p className="eyebrow">NEWEIX · SUPREME PANEL</p>
      <h1>Manager Appointment Review</h1>
      <p className="hero-copy">Review Manager nominations submitted by Admins. Approval records the decision; the Manager account is provisioned separately by Supreme.</p>
      <SupremeManagerNominations />
      <p><Link href="/supreme">← Back to Supreme Dashboard</Link></p>
    </main>
  );
}
