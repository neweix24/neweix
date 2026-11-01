"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useEffect, useState } from "react";

type Product = { id: string; name: string; stock: number; low_stock_threshold?: number };

const shortcuts = [
  { href: "/admin/products", title: "Products & Stock", description: "Manage the product catalogue and stock visibility.", icon: "package" },
  { href: "/admin/orders", title: "Orders & Payments", description: "Review incoming orders and payment progress.", icon: "orders" },
  { href: "/admin/customers", title: "Customer CRM", description: "Review customer account information.", icon: "user" },
  { href: "/supreme/audit-logs", title: "Audit Logs", description: "Review recorded administrative activity.", icon: "shield" },
  { href: "/supreme/system", title: "System Monitor", description: "Review system health and operational signals.", icon: "settings" },
  { href: "/supreme/eixpay", title: "EixPay Control", description: "Open wallet and payment administration.", icon: "wallet" },
] as const;

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
      if (!response.ok) throw new Error(data.error || "Product information could not be loaded.");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, []);

  const lowStockProducts = products.filter((product) => product.stock <= (product.low_stock_threshold ?? 5));
  const outOfStock = products.filter((product) => product.stock <= 0).length;

  return (
    <main className="min-h-screen px-4 py-9 sm:px-6" style={{ background: "radial-gradient(ellipse at 85% 0%,rgba(182,255,74,.13),transparent 38%),linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border p-7 sm:p-10" style={{ borderColor: "#dfeade", background: "radial-gradient(ellipse at 100% 0%,rgba(182,255,74,.18),transparent 45%),linear-gradient(135deg,#fff,#f5ffef)", boxShadow: "0 14px 38px rgba(45,110,65,.07)" }}>
          <div>
            <p className="text-xs font-black tracking-[.2em]" style={{ color: "#368c61" }}>NEWEIX · SUPREME CONTROL</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Supreme Dashboard</h1>
            <p className="mt-2 max-w-2xl leading-7" style={{ color: "var(--muted)" }}>A central overview of store operations, inventory health and administrative controls.</p>
          </div>
          <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="inline-flex min-h-12 items-center gap-2 rounded-xl px-5 py-3 font-extrabold disabled:opacity-60" style={{ background: "linear-gradient(110deg,#b6ff4a,#73e58b 55%,#39c6a5)", color: "#102516", boxShadow: "0 9px 22px rgba(67,172,104,.16)" }}>
            <Icon name="refresh" size={17} /> {loading ? "Refreshing…" : "Refresh overview"}
          </button>
        </header>

        {error && <section role="alert" className="rounded-2xl border p-4 text-sm" style={{ borderColor: "#efcaca", background: "#fff8f7", color: "#a13e3e" }}>{error}</section>}

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Inventory overview">
          <article className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "#e0eae0", background: "rgba(255,255,255,.96)", boxShadow: "0 10px 28px rgba(45,110,65,.05)" }}>
            <div className="flex items-center justify-between"><span className="text-sm font-bold" style={{ color: "var(--muted)" }}>Total products</span><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="package" size={20} /></span></div>
            <p className="mt-4 text-4xl font-black">{loading ? "—" : products.length}</p><p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Products visible to the admin workspace</p>
          </article>
          <article className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "#f0dfc5", background: "rgba(255,255,255,.96)", boxShadow: "0 10px 28px rgba(45,110,65,.05)" }}>
            <div className="flex items-center justify-between"><span className="text-sm font-bold" style={{ color: "var(--muted)" }}>Low stock</span><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#fff5e8", color: "#a7671d" }}><Icon name="package" size={20} /></span></div>
            <p className="mt-4 text-4xl font-black" style={{ color: "#a7671d" }}>{loading ? "—" : lowStockProducts.length}</p><p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>At or below each product&apos;s threshold</p>
          </article>
          <article className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "#efcccc", background: "rgba(255,255,255,.96)", boxShadow: "0 10px 28px rgba(45,110,65,.05)" }}>
            <div className="flex items-center justify-between"><span className="text-sm font-bold" style={{ color: "var(--muted)" }}>Out of stock</span><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#fff0ef", color: "#a13e3e" }}><Icon name="close" size={20} /></span></div>
            <p className="mt-4 text-4xl font-black" style={{ color: "#a13e3e" }}>{loading ? "—" : outOfStock}</p><p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Products currently unavailable</p>
          </article>
        </section>

        <section>
          <div className="mb-4"><p className="text-xs font-black tracking-[.16em]" style={{ color: "#368c61" }}>CONTROL CENTER</p><h2 className="mt-1 text-xl font-black">Quick access</h2></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((item) => <Link key={item.href} href={item.href} className="group flex min-h-40 flex-col justify-between rounded-2xl border p-5 transition duration-200 hover:-translate-y-1" style={{ borderColor: "#e0eae0", background: "rgba(255,255,255,.96)", boxShadow: "0 10px 28px rgba(45,110,65,.05)" }}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name={item.icon} size={21} /></span>
              <span><strong className="block text-lg font-black">{item.title}</strong><span className="mt-1 block text-sm leading-6" style={{ color: "var(--muted)" }}>{item.description}</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open control →</span>
            </Link>)}
          </div>
        </section>

        <section className="rounded-3xl border p-5 sm:p-7" style={{ borderColor: "#e0eae0", background: "rgba(255,255,255,.96)", boxShadow: "0 10px 28px rgba(45,110,65,.05)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black tracking-[.16em]" style={{ color: "#368c61" }}>INVENTORY WATCH</p><h2 className="mt-1 text-xl font-black">Low-stock products</h2></div><Link href="/admin/inventory" className="text-sm font-extrabold" style={{ color: "#28764b" }}>View inventory →</Link></div>
          {loading ? <p className="mt-5 text-sm" style={{ color: "var(--muted)" }}>Loading inventory information…</p> : error ? <p className="mt-5 text-sm" style={{ color: "var(--muted)" }}>Inventory information is unavailable. Use Refresh overview to try again.</p> : lowStockProducts.length === 0 ? <p className="mt-5 rounded-xl p-4 text-sm" style={{ background: "#f4ffef", color: "#28764b" }}>All products are above their low-stock thresholds.</p> : <div className="mt-5 divide-y" style={{ borderColor: "#edf1eb" }}>{lowStockProducts.slice(0, 8).map((product) => <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="font-bold">{product.name}</span><span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: product.stock <= 0 ? "#fff0ef" : "#fff5e8", color: product.stock <= 0 ? "#a13e3e" : "#a7671d" }}>{product.stock <= 0 ? "Out of stock" : "Stock: " + product.stock}</span></div>)}</div>}
          <Link href="/admin/products" className="mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold" style={{ borderColor: "#dfeade", color: "#285c3b" }}><Icon name="package" size={16} /> View all products</Link>
        </section>

        <p className="rounded-2xl border p-4 text-xs leading-6" style={{ borderColor: "#dfeade", background: "rgba(255,255,255,.75)", color: "var(--muted)" }}>Administrative actions remain protected by server-side role checks and existing API permissions. This dashboard is an overview; it does not grant additional privileges.</p>
      </div>
    </main>
  );
}
