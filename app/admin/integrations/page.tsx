import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import { requireStaff } from "@/lib/auth";
import PathaoPanel from "@/features/admin/pathao-panel";
import BulkSmsPanel from "@/features/admin/bulksms-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrations | NEWEIX Admin",
  robots: { index: false, follow: false },
};

export default async function AdminIntegrationsPage() {
  await requireStaff(["supreme", "admin"]);

  return (
    <main className="min-h-screen px-4 py-9 sm:px-6" style={{ background: "radial-gradient(ellipse at 85% 0%,rgba(182,255,74,.13),transparent 38%),linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 rounded-3xl border p-7 sm:p-9" style={{ borderColor: "#dfeade", background: "radial-gradient(ellipse at 100% 0%,rgba(182,255,74,.18),transparent 45%),linear-gradient(135deg,#fff,#f5ffef)", boxShadow: "0 14px 38px rgba(45,110,65,.07)" }}>
          <Link href="/admin" className="mb-5 inline-flex items-center gap-2 text-sm font-bold" style={{ color: "#34734b" }}><Icon name="chevron-left" size={16} /> Admin dashboard</Link>
          <p className="text-xs font-black tracking-[.2em]" style={{ color: "#368c61" }}>NEWEIX · SERVICE CONNECTIONS</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Integrations</h1>
          <p className="mt-2 max-w-2xl leading-7" style={{ color: "var(--muted)" }}>Check provider connectivity and review the required setup for courier delivery and transactional SMS.</p>
        </header>

        <div className="space-y-5">
          <PathaoPanel />
          <BulkSmsPanel />
        </div>

        <p className="mt-6 rounded-2xl border p-4 text-xs leading-6" style={{ borderColor: "#dfeade", background: "rgba(255,255,255,.8)", color: "var(--muted)" }}>Provider connectivity checks do not create courier bookings or send test SMS. Complete a controlled end-to-end test before relying on either service for live customer orders.</p>
      </div>
    </main>
  );
}
