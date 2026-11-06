import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import AdminStaffManager from "./AdminStaffManager";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  await requireStaff(["admin"]);
  return (
    <main className="premium-admin-operations-page hero auth-page">
      <p className="eyebrow">NEWEIX · ADMIN WORKSPACE</p>
      <h1>Employee & Manager Requests</h1>
      <p className="hero-copy">
        Admins can create Employee accounts and submit Manager appointment nominations for Supreme review.
      </p>
      <AdminStaffManager />
      <p><Link href="/admin">← Back to Admin Dashboard</Link></p>
    </main>
  );
}
