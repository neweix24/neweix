import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import CustomerDataRequestsManager from "@/features/admin/customer-data-requests-manager";

export const dynamic = "force-dynamic";

export default async function AdminCustomerDataRequestsPage() {
  const staff = await requireStaff(["supreme"]);
  return (
    <main className="premium-admin-operations-page min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · ADMIN</p>
          <h1 className="mt-2 text-3xl font-bold">Customer Data Requests</h1>
          <p className="mt-2">Signed-in role: <strong style={{ color: "var(--primary)" }}>{staff.role}</strong></p>
          <Link href="/admin" className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>← Admin Dashboard</Link>
        </header>
        <CustomerDataRequestsManager />
      </div>
    </main>
  );
}
