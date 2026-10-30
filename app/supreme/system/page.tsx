import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import SystemMonitor from "@/features/supreme/system-monitor";

export const dynamic = "force-dynamic";

export default async function SupremeSystemPage() {
  const staff = await requireStaff(["supreme"]);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · SUPREME CONTROL</p>
          <h1 className="mt-2 text-3xl font-bold">সিস্টেম মনিটরিং</h1>
          <p className="mt-2">লগইন করা Role: <strong>{staff.role}</strong></p>
          <Link href="/supreme" className="mt-4 inline-flex text-sm font-semibold underline" style={{ color: "var(--primary)" }}>
            ← Supreme Dashboard
          </Link>
        </header>
        <SystemMonitor />
      </div>
    </main>
  );
}
