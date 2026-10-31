import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import SupremeDashboard from "@/features/supreme/supreme-dashboard";

export const dynamic = "force-dynamic";

export default async function SupremePage() {
  const staff = await requireStaff(["supreme"]);

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <header className="border-b px-4 py-4 sm:px-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">NEWEIX · SUPREME CONTROL</p>
            <p className="mt-1 text-sm">লগইন করা Role: <strong style={{ color: "var(--primary)" }}>{staff.role}</strong></p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/supreme/eixverse" className="text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>Campaigns & Missions</Link>
            <Link href="/supreme/eixpay" className="text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>EixPay Control</Link>
            <Link href="/supreme/reviews" className="text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>রিভিউ অনুমোদন</Link>
            <Link href="/supreme/audit-logs" className="text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>অডিট লগ</Link>
            <Link href="/supreme/system" className="text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>সিস্টেম মনিটর</Link>
            <Link href="/" className="text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>স্টোরফ্রন্ট</Link>
            <form action="/auth/logout" method="post">
              <button type="submit" className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>
                লগআউট
              </button>
            </form>
          </div>
        </div>
      </header>
      <SupremeDashboard />
    </main>
  );
}
