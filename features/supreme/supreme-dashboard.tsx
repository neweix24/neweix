"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold?: number;
};

function MetricCard({ label, value, hint, warning = false }: {
  label: string;
  value: string | number;
  hint: string;
  warning?: boolean;
}) {
  return (
    <article className="min-w-0 rounded-2xl border p-5 sm:p-6" style={{
      borderColor: warning ? "rgba(255,119,119,.35)" : "var(--border)",
      background: "linear-gradient(145deg, var(--surface-raised), var(--surface))",
    }}>
      <p className="text-sm font-semibold" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight sm:text-4xl" style={{ color: warning ? "var(--danger)" : "var(--ink)" }}>{value}</p>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{hint}</p>
    </article>
  );
}

export default function SupremeDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/products", { method: "GET", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "পণ্যের তথ্য লোড করা যায়নি।");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "সার্ভারের সঙ্গে সংযোগ করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, []);

  const lowStockProducts = useMemo(
    () => products.filter((product) => product.stock <= (product.low_stock_threshold ?? 5)),
    [products]
  );

  return (
    <main className="min-h-screen px-4 py-7 sm:px-6 sm:py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl space-y-7">
        <section className="relative overflow-hidden rounded-3xl border p-6 sm:p-9" style={{
          borderColor: "var(--border)",
          background: "radial-gradient(ellipse at 90% 0%, rgba(196,243,107,.14), transparent 42%), linear-gradient(135deg, #17251a, #0e1510 72%)",
        }}>
          <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="neweix-kicker">NEWEIX · SUPREME CONTROL</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">সিস্টেম ও ব্যবসার সারাংশ</h1>
              <p className="mt-2 max-w-xl text-sm sm:text-base" style={{ color: "var(--muted)" }}>
                পণ্য, ইনভেন্টরি এবং গুরুত্বপূর্ণ অপারেশন এক জায়গা থেকে পর্যবেক্ষণ করুন।
              </p>
            </div>
            <button type="button" onClick={() => void loadDashboard()} disabled={loading}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-extrabold"
              style={{ background: "var(--primary)", color: "#10170d" }}>
              {loading ? "তথ্য আপডেট হচ্ছে…" : "↻ তথ্য রিফ্রেশ করুন"}
            </button>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border" style={{ borderColor: "rgba(196,243,107,.16)", boxShadow: "0 0 0 28px rgba(196,243,107,.025), 0 0 0 58px rgba(196,243,107,.02)" }} />
        </section>

        {error && <section role="alert" className="rounded-2xl border p-4 text-sm" style={{ borderColor: "rgba(255,119,119,.4)", background: "rgba(255,119,119,.08)", color: "var(--danger)" }}>{error}</section>}

        <section aria-label="ব্যবসার পরিসংখ্যান" className="grid gap-4 sm:grid-cols-2">
          <MetricCard label="মোট পণ্য" value={loading ? "—" : products.length} hint="সিস্টেমে পাওয়া পণ্যের সংখ্যা" />
          <MetricCard label="কম স্টকের পণ্য" value={loading ? "—" : lowStockProducts.length} hint="নির্ধারিত সীমা বা তার নিচে থাকা পণ্য" warning={lowStockProducts.length > 0} />
        </section>

        <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-5 sm:px-6" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="neweix-kicker">INVENTORY WATCH</p>
              <h2 className="mt-1 text-xl font-extrabold">কম স্টকের পণ্য</h2>
            </div>
            <Link href="/admin/products" className="neweix-button-secondary text-sm">সব পণ্য দেখুন →</Link>
          </div>
          {loading ? <p className="px-6 py-8 text-sm" style={{ color: "var(--muted)" }}>ডেটাবেস থেকে তথ্য আনা হচ্ছে…</p>
            : error ? <p className="px-6 py-8 text-sm" style={{ color: "var(--muted)" }}>তথ্য পাওয়া যায়নি। উপরের বার্তাটি দেখুন।</p>
            : lowStockProducts.length === 0 ? <div className="px-6 py-10 text-center"><p className="text-2xl">✓</p><p className="mt-2 font-bold">বর্তমানে কম স্টকের পণ্য নেই</p><p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>ইনভেন্টরি স্বাভাবিক সীমায় আছে।</p></div>
            : <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {lowStockProducts.map((product) => <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <span className="min-w-0 font-semibold">{product.name}</span>
                <span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ color: "var(--danger)", background: "rgba(255,119,119,.1)" }}>স্টক: {product.stock}</span>
              </li>)}
            </ul>}
        </section>
      </div>
    </main>
  );
}
