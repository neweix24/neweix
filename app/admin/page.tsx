import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const staff = await requireStaff(["supreme", "admin", "staff"]);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · ADMIN WORKSPACE</p>
          <h1 className="mt-2 text-3xl font-bold">অ্যাডমিন ড্যাশবোর্ড</h1>
          <p className="mt-2">লগইন করা Role: <strong style={{ color: "var(--primary)" }}>{staff.role}</strong></p>
        </header>

        <section className="rounded-2xl border p-5 sm:p-7" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="text-xl font-semibold">ব্যবস্থাপনা</h2>
          <p className="mt-2">আপনার অনুমতি অনুযায়ী ব্যবস্থাপনার অপশন নির্বাচন করুন।</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/admin/products" className="inline-flex min-h-11 items-center rounded-xl px-5 py-3 font-semibold" style={{ background: "var(--primary)", color: "#10170d" }}>
              পণ্য ও স্টক ব্যবস্থাপনা →
            </Link>
            {staff.role !== "staff" && (
              <Link href="/admin/orders" className="inline-flex min-h-11 items-center rounded-xl border px-5 py-3 font-semibold" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
                অর্ডার ও পেমেন্ট →
              </Link>
            )}
            <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border px-5 py-3 font-semibold" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
              স্টোরফ্রন্ট দেখুন
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}