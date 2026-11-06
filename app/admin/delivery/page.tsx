import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import NeweixDeliveryZonesManager from "@/features/admin/neweix-delivery-zones-manager";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  await requireStaff(["supreme", "admin"]);
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · DELIVERY OPERATIONS</p>
          <h1 className="mt-2 text-3xl font-bold">NEWEIX Delivery Zones</h1>
          <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--muted)" }}>
            Configure NEWEIX-operated delivery independently from Pathao Courier.
          </p>
          <Link href="/admin" className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>
            ← Back to Admin Dashboard
          </Link>
        </header>
        <NeweixDeliveryZonesManager />
      </div>
    </main>
  );
}
