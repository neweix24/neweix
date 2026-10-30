import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import OrdersManager from "@/features/admin/orders-manager";
import PathaoPanel from "@/features/admin/pathao-panel";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const staff = await requireStaff(["supreme", "admin"]);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · ADMIN</p>
          <h1 className="mt-2 text-3xl font-bold">অর্ডার ও পেমেন্ট</h1>
          <p className="mt-2">লগইন করা Role: <strong style={{ color: "var(--primary)" }}>{staff.role}</strong></p>
          <Link href="/admin" className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>
            ← অ্যাডমিন ড্যাশবোর্ড
          </Link>
        </header>
        <PathaoPanel />
        <OrdersManager />
      </div>
    </main>
  );
}