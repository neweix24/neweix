"use client";
import { useCallback, useEffect, useState } from "react";

type Rule = { event_code: string; display_name: string; description: string; enabled: boolean; reward_amount: number; max_per_user_per_day: number; settlement_delay_hours: number; requires_verified_phone: boolean };
type Tier = { tier_code: string; display_name: string; tier_rank: number; is_enabled: boolean; min_qualified_spend_bdt: number | null; min_qualified_orders: number | null; qualification_period_days: number | null; benefits: string[] };
type Dashboard = {
  program: { wallet_enabled: boolean; earning_enabled: boolean; redemption_enabled: boolean; transfer_enabled: boolean; transfer_legal_review_confirmed: boolean };
  reward_rules: Rule[]; membership_tiers: Tier[];
  stats: { wallet_count: number; total_eixon_balance: number; pending_transfers: number; pending_redemptions: number; pending_order_rewards: number; outstanding_reward_debt: number };
};
type Customer = { user_id: string; name: string; email: string | null; masked_phone: string | null };

export default function EixPayProgramControl() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [program, setProgram] = useState({ walletEnabled: true, earningEnabled: false, redemptionEnabled: false, transferEnabled: false });
  const [rules, setRules] = useState<Record<string, { enabled: boolean; amount: string; max: string }>>({});
  const [tiers, setTiers] = useState<Record<string, { enabled: boolean; spend: string; orders: string; days: string; benefits: string }>>({});
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [assignTier, setAssignTier] = useState("free");
  const [expiry, setExpiry] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy("load"); setError("");
    try {
      const response = await fetch("/api/supreme/eixpay", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "কন্ট্রোল ডেটা লোড করা যায়নি।");
      const d = result.data as Dashboard;
      setData(d);
      setProgram({ walletEnabled: d.program.wallet_enabled, earningEnabled: d.program.earning_enabled, redemptionEnabled: d.program.redemption_enabled, transferEnabled: d.program.transfer_enabled });
      setRules(Object.fromEntries(d.reward_rules.map((r) => [r.event_code, { enabled: r.enabled, amount: String(r.reward_amount), max: String(r.max_per_user_per_day) }])));
      setTiers(Object.fromEntries(d.membership_tiers.map((t) => [t.tier_code, { enabled: t.is_enabled, spend: t.min_qualified_spend_bdt === null ? "" : String(t.min_qualified_spend_bdt), orders: t.min_qualified_orders === null ? "" : String(t.min_qualified_orders), days: String(t.qualification_period_days ?? 30), benefits: t.benefits.join("\n") }])));
    } catch (e) { setError(e instanceof Error ? e.message : "কন্ট্রোল ডেটা লোড করা যায়নি।"); }
    finally { setBusy(""); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(path: string, payload: Record<string, unknown>) {
    setBusy(path); setError(""); setMessage("");
    try {
      const response = await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "সেটিং সংরক্ষণ করা যায়নি।");
      setMessage("সেটিং সফলভাবে সংরক্ষিত হয়েছে।");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "সেটিং সংরক্ষণ করা যায়নি।"); }
    finally { setBusy(""); }
  }

  async function searchCustomer() {
    setError(""); setCustomers([]); setSelected(null);
    if (search.trim().length < 3) { setError("কমপক্ষে ৩ অক্ষরের ইমেইল, ফোন বা নাম লিখুন।"); return; }
    setBusy("search");
    try {
      const response = await fetch("/api/supreme/neweix-plus?query=" + encodeURIComponent(search.trim()), { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "গ্রাহক খোঁজা যায়নি।");
      setCustomers(Array.isArray(result.customers) ? result.customers as Customer[] : []);
    } catch (e) { setError(e instanceof Error ? e.message : "গ্রাহক খোঁজা যায়নি।"); }
    finally { setBusy(""); }
  }

  async function assign() {
    if (!selected) { setError("প্রথমে গ্রাহক নির্বাচন করুন।"); return; }
    await save("/api/supreme/neweix-plus", {
      action: "assign", userId: selected.user_id, tierCode: assignTier,
      expiresAt: expiry ? new Date(expiry).toISOString() : null, note,
    });
    if (!error) { setSelected(null); setExpiry(""); setNote(""); }
  }

  if (busy === "load" || !data) return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/50">{error || "EixPay কন্ট্রোল লোড হচ্ছে…"}</div>;
  return (
    <div className="space-y-8">
      {error && <p className="rounded-xl border border-rose-200/20 bg-rose-200/[0.06] p-3 text-sm text-rose-100" role="alert">{error}</p>}
      {message && <p className="rounded-xl border border-emerald-200/20 bg-emerald-200/[0.06] p-3 text-sm text-emerald-100" role="status">{message}</p>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Wallet accounts",data.stats.wallet_count],["Total Eixon balance",data.stats.total_eixon_balance],
          ["Pending transfers",data.stats.pending_transfers],["Pending redemptions",data.stats.pending_redemptions],
          ["Order rewards pending",data.stats.pending_order_rewards],["Outstanding reward debt",data.stats.outstanding_reward_debt],
        ].map(([label,value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-white/45">{label}</p><p className="mt-2 text-2xl font-black">{Number(value).toLocaleString("en-US")}</p></div>)}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Program settings</p><h2 className="mt-1 text-xl font-bold">EixPay নিয়ন্ত্রণ</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {([
            ["walletEnabled","Wallet চালু"],["earningEnabled","Eixon earning চালু"],["redemptionEnabled","Reward redemption চালু"],
          ] as const).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-4 text-sm"><span>{label}</span><input type="checkbox" checked={program[key]} onChange={(e) => setProgram((p) => ({ ...p, [key]: e.target.checked }))} /></label>)}
          <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-4">
            <label className="flex items-center justify-between gap-3 text-sm"><span>Customer transfer চালু</span><input type="checkbox" checked={program.transferEnabled} disabled={!data.program.transfer_legal_review_confirmed} onChange={(e) => setProgram((p) => ({ ...p, transferEnabled: e.target.checked }))} /></label>
            <p className="mt-2 text-xs leading-5 text-amber-100/65">{data.program.transfer_legal_review_confirmed ? "প্রত্যেক ট্রান্সফারে Supreme approval বাধ্যতামূলক।" : "আইনি যাচাই নিশ্চিত করা হয়নি; তাই transfer switch লক করা।"}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-white/40">Staff/Admin transfer approve করতে পারবে না।</p>
        <button type="button" disabled={Boolean(busy)} onClick={() => void save("/api/supreme/eixpay", { action: "program", ...program })} className="mt-5 rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-black text-[#092016] disabled:opacity-50">{busy === "program" ? "সংরক্ষণ হচ্ছে…" : "প্রোগ্রাম সেটিং সংরক্ষণ"}</button>
      </section>

      <section className="space-y-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Reward engine</p><h2 className="mt-1 text-xl font-bold">Eixon রিওয়ার্ড নিয়ম</h2><p className="mt-1 text-xs text-white/45">সব নিয়ম শুরুতে বন্ধ। যোগ্যতার প্রমাণ ছাড়া কোনো রিওয়ার্ড ইস্যু হবে না।</p></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.reward_rules.map((r) => {
            const d = rules[r.event_code] ?? { enabled: false, amount: "0", max: "0" };
            return <article key={r.event_code} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">{r.display_name}</h3><p className="mt-1 text-xs text-white/45">{r.description}</p></div><label className="flex items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={d.enabled} onChange={(e) => setRules((s) => ({ ...s, [r.event_code]: { ...d, enabled: e.target.checked } }))} />চালু</label></div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs text-white/50">প্রতি রিওয়ার্ড<input type="number" min="0" step="1" value={d.amount} onChange={(e) => setRules((s) => ({ ...s, [r.event_code]: { ...d, amount: e.target.value } }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white" /></label>
                <label className="text-xs text-white/50">দৈনিক সর্বোচ্চ বার<input type="number" min="0" max="1000" step="1" value={d.max} onChange={(e) => setRules((s) => ({ ...s, [r.event_code]: { ...d, max: e.target.value } }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white" /></label>
              </div>
              <p className="mt-3 text-[11px] text-white/35">Settling delay: {r.event_code === "delivered_order" ? "৭ দিন" : String(r.settlement_delay_hours) + " ঘণ্টা"} · {r.requires_verified_phone ? "ফোন যাচাই বাধ্যতামূলক" : "ফোন যাচাই ঐচ্ছিক"}</p>
              <button type="button" disabled={Boolean(busy)} onClick={() => {
                const rewardAmount = Number(d.amount); const maxPerDay = Number(d.max);
                if (!Number.isSafeInteger(rewardAmount) || rewardAmount < 0 || !Number.isSafeInteger(maxPerDay) || maxPerDay < 0 || maxPerDay > 1000) { setError("রিওয়ার্ডের পরিমাণ ও দৈনিক সীমা সঠিক পূর্ণসংখ্যা হতে হবে।"); return; }
                void save("/api/supreme/eixpay", { action: "reward_rule", eventCode: r.event_code, enabled: d.enabled, rewardAmount, maxPerDay });
              }} className="mt-4 rounded-full border border-white/15 px-4 py-2 text-xs font-bold hover:bg-white/10 disabled:opacity-50">{busy === r.event_code ? "সংরক্ষণ হচ্ছে…" : "নিয়ম সংরক্ষণ"}</button>
            </article>;
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Neweix+ administration</p><h2 className="mt-1 text-xl font-bold">মেম্বারশিপ স্তর ও সুবিধা</h2></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.membership_tiers.map((t) => {
            const d = tiers[t.tier_code] ?? { enabled: t.is_enabled, spend: "", orders: "", days: "30", benefits: "" };
            return <article key={t.tier_code} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{t.display_name}</h3><label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={d.enabled} disabled={t.tier_code === "free"} onChange={(e) => setTiers((s) => ({ ...s, [t.tier_code]: { ...d, enabled: e.target.checked } }))} />চালু</label></div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs text-white/45">যোগ্য খরচ (BDT)<input type="number" min="0" value={d.spend} onChange={(e) => setTiers((s) => ({ ...s, [t.tier_code]: { ...d, spend: e.target.value } }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white" /></label>
                <label className="text-xs text-white/45">যোগ্য অর্ডার<input type="number" min="0" value={d.orders} onChange={(e) => setTiers((s) => ({ ...s, [t.tier_code]: { ...d, orders: e.target.value } }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white" /></label>
              </div>
              <label className="mt-3 block text-xs text-white/45">যোগ্যতার সময়সীমা (দিন)<input type="number" min="1" max="3650" value={d.days} onChange={(e) => setTiers((s) => ({ ...s, [t.tier_code]: { ...d, days: e.target.value } }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white" /></label>
              <label className="mt-3 block text-xs text-white/45">সদস্য সুবিধা (প্রতি লাইনে একটি)<textarea rows={3} value={d.benefits} onChange={(e) => setTiers((s) => ({ ...s, [t.tier_code]: { ...d, benefits: e.target.value } }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white" /></label>
              <button type="button" disabled={Boolean(busy)} onClick={() => {
                const minSpend = d.spend.trim() ? Number(d.spend) : null;
                const minOrders = d.orders.trim() ? Number(d.orders) : null;
                const periodDays = Number(d.days);
                const benefits = d.benefits.split("\n").map((x) => x.trim()).filter(Boolean);
                if ((minSpend !== null && (!Number.isSafeInteger(minSpend) || minSpend < 0)) || (minOrders !== null && (!Number.isSafeInteger(minOrders) || minOrders < 0)) || !Number.isSafeInteger(periodDays) || periodDays < 1 || periodDays > 3650 || benefits.length > 30 || benefits.some((x) => x.length > 240)) { setError("মেম্বারশিপ যোগ্যতা বা সুবিধার তথ্য সঠিক নয়।"); return; }
                void save("/api/supreme/neweix-plus", { action: "set_tier", tierCode: t.tier_code, enabled: d.enabled, minSpend, minOrders, periodDays, benefits });
              }} className="mt-4 rounded-full border border-amber-200/20 px-4 py-2 text-xs font-bold text-amber-100 hover:bg-amber-200/10 disabled:opacity-50">{busy === "tier:" + t.tier_code ? "সংরক্ষণ হচ্ছে…" : "স্তর সংরক্ষণ"}</button>
            </article>;
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Manual membership assignment</p><h2 className="mt-1 text-xl font-bold">গ্রাহককে Neweix+ সদস্যপদ দিন</h2>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ইমেইল, ফোন বা গ্রাহকের নাম" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white" />
          <button type="button" disabled={busy === "search"} onClick={() => void searchCustomer()} className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold disabled:opacity-50">{busy === "search" ? "খোঁজা হচ্ছে…" : "গ্রাহক খুঁজুন"}</button>
        </div>
        {customers.length > 0 && <div className="mt-3 space-y-2">{customers.map((customer) => <button type="button" key={customer.user_id} onClick={() => setSelected(customer)} className={"w-full rounded-xl border p-3 text-left text-sm " + (selected?.user_id === customer.user_id ? "border-amber-200/40 bg-amber-200/[0.08]" : "border-white/10 bg-black/10")}>
          <span className="block font-semibold">{customer.name}</span><span className="mt-1 block text-xs text-white/45">{customer.email ?? "ইমেইল নেই"} · {customer.masked_phone ?? "ফোন যাচাই নেই"}</span>
        </button>)}</div>}
        {selected && <div className="mt-4 rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] p-4">
          <p className="font-semibold">{selected.name}</p><p className="mt-1 text-xs text-white/40">Customer ID: {selected.user_id}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/50">নতুন স্তর<select value={assignTier} onChange={(e) => setAssignTier(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#121914] p-3 text-sm text-white">{data.membership_tiers.filter((t) => t.is_enabled).map((t) => <option key={t.tier_code} value={t.tier_code}>{t.display_name}</option>)}</select></label>
            <label className="text-xs text-white/50">মেয়াদ শেষ (ঐচ্ছিক)<input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#121914] p-3 text-sm text-white" /></label>
          </div>
          <label className="mt-3 block text-xs text-white/50">কারণ / নোট<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white" /></label>
          <button type="button" disabled={busy === "assign"} onClick={() => void assign()} className="mt-4 rounded-full bg-amber-200 px-5 py-2.5 text-sm font-black text-[#1c1608] disabled:opacity-50">{busy === "assign" ? "সংরক্ষণ হচ্ছে…" : "সদস্যপদ বরাদ্দ করুন"}</button>
        </div>}
      </section>
    </div>
  );
}
