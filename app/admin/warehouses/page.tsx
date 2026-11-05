import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import WarehouseManager from "@/features/admin/warehouse-manager";
import WarehouseOpeningBalanceForm from "@/features/admin/warehouse-opening-balance-form";

export const dynamic = "force-dynamic";

export default async function AdminWarehousesPage() {
  await requireStaff(["supreme", "admin"]);
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · FULFILLMENT</p>
          <h1 className="mt-2 text-3xl font-bold">Warehouses & Dispatch Locations</h1>
          <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--muted)" }}>
            Manage dispatch origins in Mymensingh, Dhaka and other cities. Each origin will have its own inventory and courier configuration.
          </p>
          <Link href="/admin" className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>
            ← Back to Admin Dashboard
          </Link>
        </header>
        <WarehouseManager />
        <div className="mt-6"><WarehouseOpeningBalanceForm /></div>
      </div>
    </main>
  );
}
