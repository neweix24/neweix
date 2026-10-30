import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import AuditLogViewer from "@/features/supreme/audit-log-viewer";

export const dynamic = "force-dynamic";

export default async function SupremeAuditLogsPage() {
  const staff = await requireStaff(["supreme"]);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · SUPREME CONTROL</p>
          <h1 className="mt-2 text-3xl font-bold">অডিট লগ</h1>
          <p className="mt-2">লগইন করা Role: <strong>{staff.role}</strong></p>
          <Link href="/supreme" className="mt-4 inline-flex text-sm font-semibold underline" style={{ color: "var(--primary)" }}>← Supreme Dashboard</Link>
        </header>
        <AuditLogViewer />
      </div>
    </main>
  );
}
