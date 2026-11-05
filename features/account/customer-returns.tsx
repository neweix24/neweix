"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/icon";

type OrderItem = { id: string; product_name: string; quantity: number; unit_price: number };
type Order = { id: string; order_number: string; status: string; total: number; created_at: string; order_items: OrderItem[] };
type ReturnRequest = { id: string; order_id: string; status: string; reason: string; customer_note: string; refund_amount: number | null; refund_method: string | null; created_at: string; orders?: { order_number?: string; status?: string } | null; customer_return_request_items?: Array<{ quantity: number; order_items?: { product_name?: string } | null }> };

const reasons = [
  ["damaged", "পণ্য ক্ষতিগ্রস্ত"],
  ["wrong_item", "ভুল পণ্য এসেছে"],
  ["missing_item", "পণ্যের অংশ/আইটেম অনুপস্থিত"],
  ["not_as_described", "বর্ণনার সঙ্গে মিল নেই"],
  ["quality_issue", "গুণগত মানের সমস্যা"],
  ["changed_mind", "মত পরিবর্তন"],
  ["other", "অন্যান্য"],
] as const;
const statusNames: Record<string, string> = { requested: "অনুরোধ জমা", approved: "অনুমোদিত", rejected: "প্রত্যাখ্যাত", received: "পণ্য গ্রহণ", refunded: "রিফান্ড সম্পন্ন", closed: "বন্ধ" };
const money = (value: number) => `৳${Number(value || 0).toLocaleString("en-BD")}`;

export default function CustomerReturns() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<string>("damaged");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [orderResponse, returnResponse] = await Promise.all([
        fetch("/api/account/orders?limit=50", { cache: "no-store" }),
        fetch("/api/account/returns", { cache: "no-store" }),
      ]);
      const [orderData, returnData] = await Promise.all([orderResponse.json(), returnResponse.json()]);
      if (!orderResponse.ok) throw new Error(orderData.error || "অর্ডার লোড করা যায়নি।");
      if (!returnResponse.ok) throw new Error(returnData.error || "রিটার্ন ইতিহাস লোড করা যায়নি।");
      setOrders(Array.isArray(orderData.orders) ? orderData.orders : []);
      setRequests(Array.isArray(returnData.requests) ? returnData.requests : []);
    } catch (e) { setError(e instanceof Error ? e.message : "তথ্য লোড করা যায়নি।"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const eligibleOrders = orders.filter((order) => order.status === "delivered" && !requests.some((r) => r.order_id === order.id && ["requested", "approved", "received"].includes(r.status)));
  const currentOrder = eligibleOrders.find((order) => order.id === selectedOrder);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const items = Object.entries(selectedItems).filter(([, quantity]) => quantity > 0).map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
    if (!selectedOrder || items.length === 0) { setError("অর্ডার এবং অন্তত একটি পণ্য নির্বাচন করুন।"); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/account/returns", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ order_id: selectedOrder, reason, customer_note: note.trim(), items }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "রিটার্ন অনুরোধ জমা হয়নি।");
      setNotice("আপনার রিটার্ন অনুরোধ জমা হয়েছে। অ্যাডমিন পর্যালোচনা করে আপডেট দেবেন।");
      setSelectedOrder(""); setSelectedItems({}); setNote("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "অনুরোধ জমা হয়নি।"); }
    finally { setSubmitting(false); }
  }

  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-5xl">
      <Link href="/account" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: "var(--primary)" }}><Icon name="chevron-left" size={16}/> আমার অ্যাকাউন্ট</Link>
      <header className="mt-5 rounded-3xl border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: "#e0eae0" }}>
        <p className="text-xs font-black tracking-[.18em]" style={{ color: "#368c61" }}>NEWEIX · CUSTOMER CARE</p>
        <h1 className="mt-2 text-3xl font-black">রিটার্ন ও রিফান্ড</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "var(--muted)" }}>ডেলিভারি সম্পন্ন অর্ডারের পণ্য ফেরতের অনুরোধ জমা দিন এবং অনুরোধের অবস্থা দেখুন।</p>
      </header>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {loading ? <p className="py-10 text-center">তথ্য লোড হচ্ছে…</p> : <>
        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm sm:p-7" style={{ borderColor: "#e0eae0" }}>
          <h2 className="text-xl font-black">নতুন রিটার্ন অনুরোধ</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>শুধু ডেলিভারি সম্পন্ন এবং বর্তমানে সক্রিয় রিটার্ন অনুরোধ নেই—এমন অর্ডার দেখানো হচ্ছে।</p>
          {eligibleOrders.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">এই মুহূর্তে রিটার্নের জন্য যোগ্য কোনো অর্ডার নেই।</p> : <form onSubmit={submit} className="mt-5 space-y-5">
            <label className="block text-sm font-bold">অর্ডার নির্বাচন করুন
              <select required value={selectedOrder} onChange={(e) => { setSelectedOrder(e.target.value); setSelectedItems({}); }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal">
                <option value="">অর্ডার বাছাই করুন</option>
                {eligibleOrders.map((order) => <option key={order.id} value={order.id}>#{order.order_number} · {new Date(order.created_at).toLocaleDateString("bn-BD")} · {money(order.total)}</option>)}
              </select>
            </label>
            {currentOrder && <fieldset className="space-y-3"><legend className="mb-2 text-sm font-bold">যে পণ্য ফেরত দিতে চান</legend>
              {currentOrder.order_items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0 flex-1"><p className="font-semibold">{item.product_name}</p><p className="text-xs text-slate-500">{money(item.unit_price)} · অর্ডারকৃত {item.quantity}টি</p></div>
                <label className="text-xs font-semibold">পরিমাণ <input aria-label={item.product_name + " ফেরতের পরিমাণ"} type="number" min="0" max={item.quantity} step="1" value={selectedItems[item.id] || 0} onChange={(e) => setSelectedItems((old) => ({ ...old, [item.id]: Math.min(item.quantity, Math.max(0, Number(e.target.value) || 0)) }))} className="ml-2 w-20 rounded-lg border border-slate-200 p-2 text-sm"/></label>
              </div>)}
            </fieldset>}
            <label className="block text-sm font-bold">রিটার্নের কারণ
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal">{reasons.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            </label>
            <label className="block text-sm font-bold">বিস্তারিত (ঐচ্ছিক)
              <textarea maxLength={1000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="সমস্যাটি সংক্ষেপে লিখুন…" className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"/>
            </label>
            <button disabled={submitting || !selectedOrder} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50" style={{ background: "#28764b" }}><Icon name={submitting ? "refresh" : "send"} size={16}/>{submitting ? "জমা হচ্ছে…" : "রিটার্ন অনুরোধ জমা দিন"}</button>
          </form>}
        </section>
        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm sm:p-7" style={{ borderColor: "#e0eae0" }}>
          <h2 className="text-xl font-black">আপনার রিটার্ন অনুরোধ</h2>
          {requests.length === 0 ? <p className="mt-4 text-sm text-slate-500">এখনও কোনো রিটার্ন অনুরোধ নেই।</p> : <div className="mt-4 space-y-3">{requests.map((r) => <article key={r.id} className="rounded-xl border border-slate-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>অর্ডার #{r.orders?.order_number || r.order_id.slice(0,8)}</strong><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{statusNames[r.status] || r.status}</span></div>
            <p className="mt-2 text-sm text-slate-600">{reasons.find(([v]) => v === r.reason)?.[1] || r.reason}</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(r.created_at).toLocaleString("bn-BD")}</p>
            {r.customer_return_request_items?.length ? <p className="mt-2 text-sm">{r.customer_return_request_items.map((i) => `${i.order_items?.product_name || "পণ্য"} × ${i.quantity}`).join(" · ")}</p> : null}
            {r.status === "refunded" && <p className="mt-2 text-sm font-bold text-emerald-700">রিফান্ড: {money(r.refund_amount || 0)} · {r.refund_method || "—"}</p>}
            {r.staff_note && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">অ্যাডমিন নোট: {r.staff_note}</p>}
          </article>)}</div>}
        </section>
      </>}
      <p className="mt-5 text-xs leading-5 text-slate-500">রিফান্ডের অবস্থা এখানে রেকর্ড করা হয়। এই পোর্টাল থেকে সরাসরি bKash, Nagad, Rocket, কার্ড বা ব্যাংকে টাকা পাঠানো হয় না।</p>
    </div>
  </main>;
}
