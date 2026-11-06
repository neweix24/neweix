"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; stock: number; low_stock_threshold?: number };
type OrderItem = { product_name?: string; product_name_snapshot?: string; quantity?: number; unit_price?: number };
type Order = {
  id: string;
  order_number?: string;
  created_at: string;
  status?: string;
  total?: number;
  subtotal?: number;
  payment_status?: string;
  shipping_district?: string | null;
  shipping_upazila?: string | null;
  order_items?: OrderItem[] | null;
};
type Period = "today" | "7d" | "month" | "year" | "all";

const periods: { value: Period; label: string }[] = [
  { value: "today", label: "আজ" },
  { value: "7d", label: "৭ দিন" },
  { value: "month", label: "এই মাস" },
  { value: "year", label: "এই বছর" },
  { value: "all", label: "সাম্প্রতিক ১০০" },
];

const shortcuts = [
  { href: "/admin/orders", title: "অর্ডার ও পেমেন্ট", description: "নতুন অর্ডার, প্রসেসিং ও পেমেন্ট যাচাই", icon: "orders" },
  { href: "/admin/products", title: "পণ্য ব্যবস্থাপনা", description: "পণ্য, মূল্য ও ক্যাটালগ নিয়ন্ত্রণ", icon: "package" },
  { href: "/admin/inventory", title: "স্টক ও গুদাম", description: "স্টক, গুদাম ও পণ্য বরাদ্দ", icon: "package" },
  { href: "/admin/customers", title: "কাস্টমার", description: "কাস্টমার তথ্য ও CRM", icon: "user" },
  { href: "/supreme/eixpay", title: "EixPay", description: "পেমেন্ট ও আর্থিক কার্যক্রম", icon: "wallet" },
  { href: "/supreme/staff", title: "টিম ও অনুমতি", description: "Staff, Manager ও অ্যাক্সেস নিয়ন্ত্রণ", icon: "shield" },
  { href: "/supreme/audit-logs", title: "নিরাপত্তা ও Audit", description: "কে কখন কী পরিবর্তন করেছে", icon: "shield" },
  { href: "/supreme/system", title: "সিস্টেম মনিটর", description: "সিস্টেম ও ইন্টিগ্রেশন পর্যবেক্ষণ", icon: "settings" },
] as const;

const money = new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("bn-BD");

function startOf(period: Period) {
  const now = new Date();
  const start = new Date(now);
  if (period === "today") start.setHours(0, 0, 0, 0);
  if (period === "7d") start.setDate(start.getDate() - 6);
  if (period === "month") start.setDate(1);
  if (period === "year") { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  return start;
}

function isPaid(status?: string) {
  return ["paid", "verified", "success", "completed"].includes((status ?? "").toLowerCase());
}

export default function SupremeDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [productError, setProductError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [period, setPeriod] = useState<Period>("7d");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setProductError("");
    setOrderError("");
    const [productResult, orderResult] = await Promise.allSettled([
      fetch("/api/admin/products", { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "পণ্যের তথ্য পাওয়া যায়নি।");
        return Array.isArray(data.products) ? data.products as Product[] : [];
      }),
      fetch("/api/admin/orders", { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "অর্ডারের তথ্য পাওয়া যায়নি।");
        return Array.isArray(data.orders) ? data.orders as Order[] : [];
      }),
    ]);
    if (productResult.status === "fulfilled") setProducts(productResult.value);
    else setProductError(productResult.reason instanceof Error ? productResult.reason.message : "পণ্যের তথ্য পাওয়া যায়নি।");
    if (orderResult.status === "fulfilled") setOrders(orderResult.value);
    else setOrderError(orderResult.reason instanceof Error ? orderResult.reason.message : "অর্ডারের তথ্য পাওয়া যায়নি।");
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => { void loadDashboard(); }, []);

  const lowStock = products.filter((p) => p.stock <= (p.low_stock_threshold ?? 5));
  const outOfStock = products.filter((p) => p.stock <= 0);
  const filteredOrders = useMemo(() => {
    if (period === "all") return orders;
    const from = startOf(period).getTime();
    return orders.filter((order) => new Date(order.created_at).getTime() >= from);
  }, [orders, period]);
  const revenue = filteredOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const paidAmount = filteredOrders.filter((order) => isPaid(order.payment_status)).reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const pendingPayments = filteredOrders.filter((order) => !isPaid(order.payment_status));
  const pendingOrders = filteredOrders.filter((order) => !["delivered", "cancelled"].includes((order.status ?? "").toLowerCase()));
  const districtTotals = new Map<string, number>();
  for (const order of filteredOrders) {
    const district = order.shipping_district?.trim() || "ঠিকানা অনুপস্থিত";
    districtTotals.set(district, (districtTotals.get(district) ?? 0) + Number(order.total ?? 0));
  }
  const topDistricts = [...districtTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recentOrders = [...filteredOrders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);

  return (
    <main className="min-h-screen px-4 py-6 text-white sm:px-6 sm:py-9" style={{ background: "radial-gradient(ellipse at 85% 0%,rgba(50,112,255,.17),transparent 34%),radial-gradient(ellipse at 5% 20%,rgba(212,175,55,.12),transparent 32%),linear-gradient(145deg,#080b12,#101722 55%,#090d15)" }}>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="relative overflow-hidden rounded-[28px] border p-5 sm:p-8" style={{ borderColor: "rgba(212,175,55,.32)", background: "linear-gradient(120deg,rgba(255,255,255,.07),rgba(255,255,255,.025))", boxShadow: "0 24px 70px rgba(0,0,0,.28)" }}>
          <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full blur-3xl" style={{ background: "rgba(212,175,55,.12)" }} />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[10px] font-black tracking-[.28em]" style={{ color: "#e3c46a" }}>NEWEIX · SUPREME COMMAND</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">কন্ট্রোল সেন্টার</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">ব্যবসা, অর্ডার, পণ্য ও নিরাপত্তার একক নিয়ন্ত্রণকেন্দ্র।</p>
              <p className="mt-3 text-[11px] text-slate-400">{lastUpdated ? `সর্বশেষ আপডেট: ${lastUpdated.toLocaleTimeString("bn-BD")}` : "তথ্য সংগ্রহ করা হচ্ছে…"}</p>
            </div>
            <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition hover:-translate-y-0.5 disabled:opacity-50" style={{ borderColor: "rgba(212,175,55,.55)", background: "linear-gradient(110deg,#e5c76d,#a9822c)", color: "#17130a" }}>
              <Icon name="refresh" size={17} /> {loading ? "আপডেট হচ্ছে…" : "রিফ্রেশ"}
            </button>
          </div>
          <div className="relative mt-6 flex flex-wrap gap-2">
            {periods.map((item) => <button key={item.value} type="button" onClick={() => setPeriod(item.value)} className="rounded-full border px-3.5 py-2 text-xs font-bold transition" style={period === item.value ? { borderColor: "#e3c46a", background: "#e3c46a", color: "#17130a" } : { borderColor: "rgba(255,255,255,.15)", background: "rgba(255,255,255,.04)", color: "#d7deea" }}>{item.label}</button>)}
          </div>
        </header>

        {(productError || orderError) && <section role="alert" className="rounded-2xl border p-4 text-sm text-rose-200" style={{ borderColor: "rgba(248,113,113,.35)", background: "rgba(127,29,29,.18)" }}>{[productError, orderError].filter(Boolean).join(" ")}</section>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="ব্যবসার সারসংক্ষেপ">
          <Metric title="মোট বিক্রি" value={orderError ? "—" : money.format(revenue)} note="নির্বাচিত সময়ের সাম্প্রতিক সর্বোচ্চ ১০০ অর্ডার" icon="wallet" />
          <Metric title="অর্ডার" value={orderError ? "—" : number.format(filteredOrders.length)} note="লোড করা অর্ডারের মধ্যে" icon="orders" />
          <Metric title="পেমেন্ট পাওয়া গেছে" value={orderError ? "—" : money.format(paidAmount)} note={`বকেয়া/অযাচাইকৃত: ${number.format(pendingPayments.length)}টি অর্ডার`} icon="wallet" />
          <Metric title="মোট পণ্য" value={productError ? "—" : number.format(products.length)} note={`কম স্টক ${number.format(lowStock.length)} · স্টক শেষ ${number.format(outOfStock.length)}`} icon="package" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: "rgba(255,255,255,.11)", background: "rgba(255,255,255,.045)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black tracking-[.2em] text-amber-300">BUSINESS PULSE</p><h2 className="mt-1 text-lg font-black">অর্ডার ও পেমেন্টের অবস্থা</h2></div><Link href="/admin/orders" className="text-xs font-bold text-amber-200">সব অর্ডার দেখুন →</Link></div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MiniMetric label="চলমান অর্ডার" value={number.format(pendingOrders.length)} />
              <MiniMetric label="পেমেন্ট অপেক্ষমাণ" value={number.format(pendingPayments.length)} />
              <MiniMetric label="স্টক সতর্কতা" value={number.format(lowStock.length)} />
            </div>
            <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "rgba(255,255,255,.09)", background: "rgba(5,9,16,.38)" }}>
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-300">পণ্যভিত্তিক লাভ ও পরিচালন খরচ</span><span className="rounded-full px-2.5 py-1 text-[10px] font-bold text-amber-200" style={{ background: "rgba(212,175,55,.12)" }}>ডেটা প্রয়োজন</span></div>
              <p className="mt-2 text-sm leading-6 text-slate-400">ক্রয়মূল্য ও খরচের নির্ভরযোগ্য রেকর্ড এখনো এই Dashboard-এ যুক্ত হয়নি। তাই ভুল লাভ/ক্ষতির সংখ্যা দেখানো হচ্ছে না।</p>
            </div>
          </div>

          <div className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: "rgba(255,255,255,.11)", background: "rgba(255,255,255,.045)" }}>
            <p className="text-[10px] font-black tracking-[.2em] text-sky-300">GEOGRAPHIC INSIGHT</p><h2 className="mt-1 text-lg font-black">জেলাভিত্তিক অর্ডার মূল্য</h2>
            <p className="mt-1 text-xs text-slate-400">লোড করা অর্ডারের ভিত্তিতে · সম্পূর্ণ জেলা রিপোর্ট পরবর্তী ধাপ</p>
            <div className="mt-5 space-y-4">
              {topDistricts.length ? topDistricts.map(([district, total]) => {
                const max = Math.max(...topDistricts.map((entry) => entry[1]), 1);
                return <div key={district}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="font-bold text-slate-200">{district}</span><span className="text-slate-400">{money.format(total)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(3, total / max * 100)}%`, background: "linear-gradient(90deg,#d4af37,#67b7ff)" }} /></div></div>;
              }) : <p className="rounded-xl p-4 text-sm text-slate-400" style={{ background: "rgba(0,0,0,.18)" }}>{loading ? "তথ্য লোড হচ্ছে…" : "এই সময়সীমায় অর্ডারের তথ্য নেই।"}</p>}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: "rgba(255,255,255,.11)", background: "rgba(255,255,255,.045)" }}>
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black tracking-[.2em] text-amber-300">ACTION REQUIRED</p><h2 className="mt-1 text-lg font-black">যেসব কাজে নজর দিতে হবে</h2></div><span className="rounded-full border px-3 py-1 text-xs font-bold text-slate-300" style={{ borderColor: "rgba(255,255,255,.12)" }}>{number.format(lowStock.length + pendingPayments.length)}টি সংকেত</span></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ActionCard title="পেমেন্ট যাচাই বাকি" value={number.format(pendingPayments.length)} detail="অর্ডার পেমেন্ট যাচাই করুন" href="/admin/orders" tone="gold" />
              <ActionCard title="কম স্টক / স্টক শেষ" value={number.format(lowStock.length)} detail="স্টক ও গুদাম দেখুন" href="/admin/inventory" tone="red" />
              <ActionCard title="চলমান অর্ডার" value={number.format(pendingOrders.length)} detail="অর্ডার প্রসেসিং পর্যবেক্ষণ" href="/admin/orders" tone="blue" />
              <ActionCard title="নিরাপত্তা কার্যক্রম" value="দেখুন" detail="Audit log ও অ্যাক্সেস পরীক্ষা" href="/supreme/audit-logs" tone="slate" />
            </div>
            {lowStock.length > 0 && <div className="mt-4 border-t pt-4" style={{ borderColor: "rgba(255,255,255,.1)" }}><p className="mb-2 text-xs font-bold text-slate-300">স্টক সতর্কতা</p>{lowStock.slice(0, 5).map((product) => <div key={product.id} className="flex justify-between gap-3 py-2 text-sm"><span className="truncate text-slate-200">{product.name}</span><span className={product.stock <= 0 ? "font-bold text-rose-300" : "font-bold text-amber-200"}>{product.stock <= 0 ? "স্টক শেষ" : `স্টক: ${number.format(product.stock)}`}</span></div>)}</div>}
          </div>

          <div className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: "rgba(255,255,255,.11)", background: "rgba(255,255,255,.045)" }}>
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black tracking-[.2em] text-sky-300">RECENT ACTIVITY</p><h2 className="mt-1 text-lg font-black">সাম্প্রতিক অর্ডার</h2></div><Link href="/admin/orders" className="text-xs font-bold text-sky-200">সব দেখুন →</Link></div>
            <div className="mt-4 divide-y" style={{ borderColor: "rgba(255,255,255,.09)" }}>
              {recentOrders.length ? recentOrders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{order.order_number || order.id.slice(0, 8)}</p><p className="mt-1 text-[11px] text-slate-400">{order.shipping_district || "ঠিকানা নেই"} · {new Date(order.created_at).toLocaleDateString("bn-BD")}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-amber-200">{money.format(Number(order.total ?? 0))}</p><p className="mt-1 text-[10px] text-slate-400">{order.status || "অবস্থা অজানা"}</p></div></div>) : <p className="py-8 text-center text-sm text-slate-400">{loading ? "অর্ডার লোড হচ্ছে…" : "কোনো অর্ডার পাওয়া যায়নি।"}</p>}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3"><p className="text-[10px] font-black tracking-[.2em] text-amber-300">SUPREME OPERATIONS</p><h2 className="mt-1 text-lg font-black">দ্রুত নিয়ন্ত্রণ</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {shortcuts.map((item) => <Link key={item.href} href={item.href} className="group flex min-h-32 items-start gap-3 rounded-2xl border p-4 transition hover:-translate-y-1 hover:border-amber-300/50" style={{ borderColor: "rgba(255,255,255,.11)", background: "rgba(255,255,255,.045)" }}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-amber-200" style={{ background: "rgba(212,175,55,.12)" }}><Icon name={item.icon} size={20} /></span><span><strong className="block text-sm font-black">{item.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{item.description}</span></span></Link>)}
          </div>
        </section>
        <p className="rounded-xl border p-3 text-[11px] leading-5 text-slate-400" style={{ borderColor: "rgba(255,255,255,.1)", background: "rgba(255,255,255,.025)" }}>তথ্যের সততা: অর্ডার সারসংক্ষেপ বর্তমানে Admin Orders API-এর সর্বশেষ ১০০টি অর্ডারের ওপর ভিত্তি করে। এটি সম্পূর্ণ হিসাব নয়। লাভ, খরচ, লাইভ ভিজিটর ও Push Notification চালু বলে দাবি করা হচ্ছে না।</p>
      </div>
    </main>
  );
}

function Metric({ title, value, note, icon }: { title: string; value: string; note: string; icon: string }) {
  return <article className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: "rgba(212,175,55,.2)", background: "linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025))", boxShadow: "0 14px 35px rgba(0,0,0,.16)" }}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-300">{title}</span><span className="grid h-9 w-9 place-items-center rounded-xl text-amber-200" style={{ background: "rgba(212,175,55,.12)" }}><Icon name={icon} size={18} /></span></div><p className="mt-4 break-words text-2xl font-black tracking-tight sm:text-3xl">{value}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{note}</p></article>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-3" style={{ borderColor: "rgba(255,255,255,.09)", background: "rgba(255,255,255,.035)" }}><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}

function ActionCard({ title, value, detail, href, tone }: { title: string; value: string; detail: string; href: string; tone: "gold" | "red" | "blue" | "slate" }) {
  const tones = { gold: "#e3c46a", red: "#fb9292", blue: "#8bc7ff", slate: "#cbd5e1" };
  return <Link href={href} className="rounded-2xl border p-4 transition hover:-translate-y-0.5" style={{ borderColor: "rgba(255,255,255,.1)", background: "rgba(0,0,0,.18)" }}><p className="text-xs font-bold text-slate-300">{title}</p><p className="mt-2 text-2xl font-black" style={{ color: tones[tone] }}>{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail} →</p></Link>;
}
