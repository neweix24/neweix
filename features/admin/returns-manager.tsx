"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/icon";

type ReturnItem = { id: string; quantity: number; order_items?: { product_name?: string; unit_price?: number; quantity?: number } | null };
type ReturnRequest = { id: string; customer_id: string; order_id: string; status: string; reason: string; customer_note: string; staff_note: string | null; refund_amount: number | null; refund_method: string | null; refund_reference: string | null; stock_restocked_at: string | null; stock_restocked_by: string | null; created_at: string; orders?: { order_number?: string; customer_name?: string; customer_phone?: string; status?: string; total?: number } | null; customer_return_request_items?: ReturnItem[] };
const labels: Record<string,string> = { requested:"অনুরোধ জমা", approved:"অনুমোদিত", rejected:"প্রত্যাখ্যাত", received:"পণ্য গ্রহণ", refunded:"রিফান্ড সম্পন্ন", closed:"বন্ধ" };
const next: Record<string,string[]> = { requested:["approved","rejected"], approved:["received","rejected"], received:["refunded","closed"], refunded:["closed"] };
const money = (n:number) => `৳${Number(n || 0).toLocaleString("en-BD")}`;

export default function ReturnsManager() {
  const [requests,setRequests] = useState<ReturnRequest[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [filter,setFilter] = useState("all");
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [refunds,setRefunds] = useState<Record<string,{amount:string;method:string;reference:string}>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/admin/returns",{cache:"no-store"}); const data = await response.json(); if(!response.ok) throw new Error(data.error || "রিটার্ন অনুরোধ লোড করা যায়নি।"); setRequests(Array.isArray(data.requests)?data.requests:[]); }
    catch(e){setError(e instanceof Error?e.message:"তথ্য লোড করা যায়নি।");} finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  async function restock(r:ReturnRequest) {
    setError("");setNotice("");setBusy(r.id);
    try {
      const response=await fetch("/api/admin/returns/restock",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({request_id:r.id,note:notes[r.id]?.trim() || "Return received and inspected."})});
      const data=await response.json();if(!response.ok)throw new Error(data.error || "স্টক আপডেট করা যায়নি।");
      setNotice(`অর্ডার #${r.orders?.order_number || r.order_id}: ফেরত পণ্যের স্টক যোগ হয়েছে।`);await load();
    }catch(e){setError(e instanceof Error?e.message:"স্টক আপডেট করা যায়নি।");}finally{setBusy("");}
  }

  async function update(r:ReturnRequest,status:string) {
    setError("");setNotice("");
    const refund = refunds[r.id] || {amount:String(r.refund_amount ?? ""),method:r.refund_method || "bkash",reference:r.refund_reference || ""};
    if(status==="refunded" && (!refund.amount || !Number.isSafeInteger(Number(refund.amount)) || Number(refund.amount)<0)){setError("সঠিক রিফান্ডের পরিমাণ লিখুন।");return;}
    setBusy(r.id);
    try {
      const response=await fetch("/api/admin/returns",{method:"PATCH",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({request_id:r.id,status,staff_note:notes[r.id] || "",...(status==="refunded"?{refund_amount:Number(refund.amount),refund_method:refund.method,refund_reference:refund.reference}: {})})});
      const data=await response.json();if(!response.ok)throw new Error(data.error || "স্ট্যাটাস আপডেট হয়নি।");
      setNotice(`অর্ডার #${r.orders?.order_number || r.order_id}: স্ট্যাটাস আপডেট হয়েছে।`);await load();
    }catch(e){setError(e instanceof Error?e.message:"আপডেট করা যায়নি।");}finally{setBusy("");}
  }

  const visible=requests.filter(r=>filter==="all" || r.status===filter);
  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{background:"linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)",color:"var(--ink)"}}>
    <div className="mx-auto max-w-7xl">
      <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-bold" style={{color:"var(--primary)"}}><Icon name="chevron-left" size={16}/> Admin Dashboard</Link>
      <header className="mt-5 rounded-3xl border bg-white p-6 shadow-sm sm:p-8" style={{borderColor:"#e0eae0"}}>
        <p className="text-xs font-black tracking-[.18em]" style={{color:"#368c61"}}>NEWEIX · CUSTOMER CARE</p><h1 className="mt-2 text-3xl font-black">Returns & Refund Review</h1><p className="mt-2 text-sm text-slate-500">Customer return requests, review decisions and manual refund records.</p>
        <div className="mt-5 flex flex-wrap gap-2">{["all","requested","approved","received","refunded","rejected","closed"].map(s=><button key={s} onClick={()=>setFilter(s)} className="rounded-full border px-3 py-2 text-xs font-bold" style={{borderColor:filter===s?"#28764b":"#e2e8f0",background:filter===s?"#eff9e9":"white",color:filter===s?"#28764b":"#475569"}}>{s==="all"?"সব":labels[s] || s}</button>)}</div>
      </header>
      {error&&<p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice&&<p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {loading?<p className="py-12 text-center">লোড হচ্ছে…</p>:visible.length===0?<p className="mt-6 rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">এই ফিল্টারে কোনো রিটার্ন অনুরোধ নেই।</p>:<div className="mt-6 grid gap-4 lg:grid-cols-2">{visible.map(r=><article key={r.id} className="rounded-2xl border bg-white p-5 shadow-sm" style={{borderColor:"#e0eae0"}}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-400">ORDER</p><h2 className="text-xl font-black">#{r.orders?.order_number || r.order_id.slice(0,8)}</h2><p className="mt-1 text-sm text-slate-600">{r.orders?.customer_name || "Customer"} · {r.orders?.customer_phone || "—"}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{labels[r.status] || r.status}</span></div>
        <div className="mt-4 space-y-2 border-y border-slate-100 py-3">{(r.customer_return_request_items || []).map(i=><div key={i.id} className="flex justify-between gap-3 text-sm"><span>{i.order_items?.product_name || "পণ্য"} × {i.quantity}</span><span className="font-semibold">{money((i.order_items?.unit_price || 0)*i.quantity)}</span></div>)}</div>
        <p className="mt-3 text-sm"><strong>কারণ:</strong> {r.reason}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{r.customer_note || "কোনো অতিরিক্ত নোট নেই।"}</p>
        <label className="mt-4 block text-xs font-bold">অ্যাডমিন নোট<textarea rows={2} maxLength={1000} value={notes[r.id] ?? r.staff_note ?? ""} onChange={e=>setNotes(old=>({...old,[r.id]:e.target.value}))} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal"/></label>
        {r.status==="received"&&<div className="mt-3 space-y-3">
          {r.stock_restocked_at ? <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">ইনভেন্টরিতে স্টক ফেরত যোগ হয়েছে · {new Date(r.stock_restocked_at).toLocaleString("bn-BD")}</p> : <button type="button" disabled={busy===r.id} onClick={()=>void restock(r)} className="rounded-xl border border-emerald-700 px-4 py-2 text-xs font-extrabold text-emerald-800 disabled:opacity-50">{busy===r.id?"স্টক আপডেট হচ্ছে…":"ফেরত পণ্যের স্টক যোগ করুন"}</button>}
          <div className="grid gap-2 sm:grid-cols-3"><label className="text-xs font-bold">রিফান্ড (BDT)<input type="number" min="0" step="1" value={refunds[r.id]?.amount ?? String(r.refund_amount ?? "")} onChange={e=>setRefunds(old=>({...old,[r.id]:{...(old[r.id]||{amount:"",method:"bkash",reference:""}),amount:e.target.value}}))} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-xs font-bold">পদ্ধতি<select value={refunds[r.id]?.method ?? r.refund_method ?? "bkash"} onChange={e=>setRefunds(old=>({...old,[r.id]:{...(old[r.id]||{amount:"",method:"bkash",reference:""}),method:e.target.value}}))} className="mt-1 w-full rounded-lg border bg-white p-2">{["original","bkash","nagad","rocket","bank","eixon","manual"].map(m=><option key={m} value={m}>{m}</option>)}</select></label><label className="text-xs font-bold">রেফারেন্স<input maxLength={120} value={refunds[r.id]?.reference ?? r.refund_reference ?? ""} onChange={e=>setRefunds(old=>({...old,[r.id]:{...(old[r.id]||{amount:"",method:"bkash",reference:""}),reference:e.target.value}}))} className="mt-1 w-full rounded-lg border p-2"/></label></div></div>}
        {next[r.status]?.length>0&&<div className="mt-4 flex flex-wrap gap-2">{next[r.status].map(s=><button key={s} disabled={busy===r.id} onClick={()=>void update(r,s)} className="rounded-xl px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50" style={{background:s==="rejected"?"#b45353":"#28764b"}}>{busy===r.id?"আপডেট হচ্ছে…":labels[s]}</button>)}</div>}
      </article>)}</div>}
      <p className="mt-5 text-xs leading-5 text-slate-500">এই স্ক্রিন রিফান্ডের রেকর্ড সংরক্ষণ করে; কোনো পেমেন্ট গেটওয়ে বা MFS-এ স্বয়ংক্রিয় টাকা পাঠায় না।</p>
    </div>
  </main>;
}
