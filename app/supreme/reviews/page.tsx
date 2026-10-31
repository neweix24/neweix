import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import ProductReviewModeration from "@/features/supreme/product-review-moderation";

export const dynamic = "force-dynamic";

export default async function SupremeReviewsPage() {
  const staff = await requireStaff(["supreme"]);
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <header className="border-b px-4 py-4 sm:px-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold tracking-[.18em]" style={{ color: "var(--primary)" }}>NEWEIX · SUPREME CONTROL</p><p className="mt-1 text-sm">লগইন করা Role: <strong>{staff.role}</strong></p></div>
          <div className="flex flex-wrap gap-3 text-sm font-semibold">
            <Link href="/supreme/eixpay" className="underline underline-offset-4">EixPay Control</Link>
            <Link href="/supreme" className="underline underline-offset-4">Supreme Dashboard</Link>
          </div>
        </div>
      </header>
      <ProductReviewModeration />
    </main>
  );
}
