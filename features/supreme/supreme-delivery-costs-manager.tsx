"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DeliveryOrder = { id: string; order_number: string; delivery_provider: "pathao" | "neweix_own"; status: string; delivery_status: string | null; delivery_fee: number | null; pathao_estimated_fee: number | null };
type CostEntry = { id: string; order_id: string; order_number: string | null; provider: string; cost_type: string; entry_kind: string; amount: number; cost_date: string; source_type: string };
type Summary = { pathao_cost: number; neweix_own_cost: number; total_delivery_cost: number; entry_count: number };
const money = (value: number) => new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(value);
const today = () => new Date(Date.now() + 21600000).toISOString().slice(0, 10);
const labels: Record<string, string> = { delivery_charge: "ডেলিভারি চার্জ", return_charge: "রিটার্ন চার্জ", rider_payment: "রাইডার পেমেন্ট", fuel: "জ্বালানি", toll: "টোল", packaging: "প্যাকেজিং", other: "Other" };

export default function SupremeDeliveryCostsManager() {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orderId, setOrderId] = useState("");
  const [costType, setCostType] = useState("delivery_charge");
  const [entryKind, setEntryKind] = useState("charge");
  const [amount, setAmount] = useState("");
  const [costDate, setCostDate] = useState(today());
  const [sourceType, setSourceType] = useState("manual_receipt");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = useMemo(() => orders.find((order) => order.id === orderId) ?? null, [orders, orderId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/supreme/finance/delivery-costs", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "ডেলিভারি Charge লোড করা যায়নি।");
      setOrders(payload.orders ?? []);
      setEntries(payload.entries ?? []);
      setSummary(payload.summary ?? null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "তথ্য লোড করা যায়নি।");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) { setError("প্রথমে একটি Select an order।"); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/supreme/finance/delivery-costs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: selected.id, provider: selected.delivery_provider, cost_type: costType, entry_kind: entryKind, amount: Number(amount), cost_date: costDate, source_type: sourceType, source_reference: reference.trim() || null, notes: notes.trim() || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Charge সংরক্ষণ করা যায়নি।");
      setAmount(""); setReference(""); setNotes("");
      setNotice("প্রকৃত ডেলিভারি Charge সংরক্ষণ হয়েছে।");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Charge সংরক্ষণ করা যায়নি।"); }
    finally { setSaving(false); }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-24 text-white sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Supreme Finance</p><h1 className="mt-1 text-2xl font-bold">Delivery Cost Reconciliation</h1><p className="mt-1 max-w-2xl text-sm text-slate-400">Record actual courier charges from Pathao settlements and rider or fuel expenses for NEWEIX deliveries.</p></div>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold">Refresh</button>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Actual Pathao cost</p><p className="mt-2 text-2xl font-bold text-amber-300">{money(summary?.pathao_cost ?? 0)}</p></article>
        <article className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">NEWEIX own delivery</p><p className="mt-2 text-2xl font-bold text-sky-300">{money(summary?.neweix_own_cost ?? 0)}</p></article>
        <article className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Total recorded costs</p><p className="mt-2 text-2xl font-bold">{money(summary?.total_delivery_cost ?? 0)}</p><p className="mt-1 text-xs text-slate-500">{summary?.entry_count ?? 0}entries · not a complete account</p></article>
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Add an actual delivery cost</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">Do not enter the checkout delivery fee or a Pathao quote as a cost. Enter an amount from a receipt, cashbook, or actual settlement.</p>
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300 sm:col-span-2">Order<select required value={orderId} onChange={(e) => setOrderId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white"><option value="">Select an order</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.order_number} · {order.delivery_provider === "pathao" ? "Pathao" : "NEWEIX"} · {order.delivery_status ?? order.status}</option>)}</select></label>
          {selected && <p className="sm:col-span-2 text-xs text-slate-400">Customer delivery fee: {money(Number(selected.delivery_fee ?? 0))} · This is not an actual cost.</p>}
          <label className="text-sm text-slate-300">Cost category<select value={costType} onChange={(e) => setCostType(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm text-slate-300">Entry type<select value={entryKind} onChange={(e) => setEntryKind(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white"><option value="charge">Charge</option><option value="refund">Charge ফেরত/সমন্বয়</option></select></label>
          <label className="text-sm text-slate-300">Amount (BDT)<input required type="number" min="1" max="1000000000" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></label>
          <label className="text-sm text-slate-300">Chargeের Date<input required type="date" value={costDate} onChange={(e) => setCostDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></label>
          <label className="text-sm text-slate-300">Evidence source<select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white"><option value="manual_receipt">Receipt</option><option value="cashbook">Cashbook</option><option value="other">Other</option></select></label>
          <label className="text-sm text-slate-300">Receipt / Reference নম্বর (ঐচ্ছিক)<input maxLength={160} value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></label>
          <label className="text-sm text-slate-300 sm:col-span-2">Notes (optional)<textarea maxLength={1000} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></label>
          <button disabled={saving || !selected} className="rounded-xl bg-amber-300 px-5 py-3 font-bold text-slate-950 disabled:opacity-50 sm:col-span-2">{saving ? "সংরক্ষণ হচ্ছে..." : "প্রকৃত Charge সংরক্ষণ করুন"}</button>
        </form>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="border-b border-slate-800 p-4"><h2 className="font-bold">সাম্প্রতিক Chargeের খতিয়ান</h2><p className="mt-1 text-xs text-slate-400">আগে import করা matched Pathao settlement delivery charge-ও এখানে দেখা যাবে।</p></div>
        {loading ? <p className="p-5 text-sm text-slate-400">Loading...</p> : entries.length === 0 ? <p className="p-5 text-sm text-slate-400">এখনো কোনো প্রকৃত ডেলিভারি Charge রেকর্ড নেই।</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="p-3">Date</th><th className="p-3">Order</th><th className="p-3">প্রোভাইডার</th><th className="p-3">Category</th><th className="p-3">Source</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t border-slate-800"><td className="p-3">{entry.cost_date}</td><td className="p-3">{entry.order_number ?? "Order লিংক অনুপস্থিত"}</td><td className="p-3">{entry.provider === "pathao" ? "Pathao" : "NEWEIX"}</td><td className="p-3">{labels[entry.cost_type] ?? entry.cost_type}{entry.entry_kind === "refund" ? " · ফেরত" : ""}</td><td className="p-3">{entry.source_type}</td><td className="p-3 text-right font-semibold">{entry.entry_kind === "refund" ? "−" : ""}{money(Number(entry.amount))}</td></tr>)}</tbody></table></div>}
      </section>
    </main>
  );
}
