"use client";
import { useCallback, useEffect, useState } from "react";
type TransferRequest = {
  request_id: string; sender_eix_id: string; recipient_eix_id: string;
  sender_name: string; recipient_name: string; amount: number; reason: string; requested_at: string;
};
function formatDate(value: string) {
  return new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export default function EixPayTransferApprovals() {
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/supreme/eixpay/transfers", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "অনুরোধ লোড করা যায়নি।");
      setRequests(Array.isArray(result.requests) ? result.requests as TransferRequest[] : []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "অনুরোধ লোড করা যায়নি।"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function decide(requestId: string, decision: "approve" | "reject") {
    setBusyId(requestId); setError(""); setMessage("");
    try {
      const response = await fetch("/api/supreme/eixpay/transfers", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision, note: notes[requestId] ?? "" }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "সিদ্ধান্ত সংরক্ষণ করা যায়নি।");
      setMessage(decision === "approve" ? "অনুরোধ অনুমোদিত হয়েছে।" : "অনুরোধ প্রত্যাখ্যান করা হয়েছে।");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "সিদ্ধান্ত সংরক্ষণ করা যায়নি।"); }
    finally { setBusyId(""); }
  }
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.06] p-4 text-sm leading-6 text-amber-100/80">
        প্রতিটি Eixon ট্রান্সফারের আগে Supreme অনুমোদন বাধ্যতামূলক। আইনি যাচাই নিশ্চিত না হওয়া পর্যন্ত ডেটাবেস ট্রান্সফার বন্ধ রাখবে; এই পেজ Supreme MFA (AAL2) যাচাইও করে।
      </div>
      {message && <p className="rounded-xl border border-emerald-200/20 bg-emerald-200/[0.06] p-3 text-sm text-emerald-100" role="status">{message}</p>}
      {error && <p className="rounded-xl border border-rose-200/20 bg-rose-200/[0.06] p-3 text-sm text-rose-100" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Approval queue</p><h2 className="mt-1 text-2xl font-bold">অপেক্ষমাণ ট্রান্সফার</h2></div>
        <button type="button" onClick={() => void load()} disabled={loading || Boolean(busyId)} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">রিফ্রেশ</button>
      </div>
      {loading ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/50">অনুরোধ লোড হচ্ছে…</div>
        : requests.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center"><p className="text-lg font-bold">কোনো অপেক্ষমাণ অনুরোধ নেই</p><p className="mt-2 text-sm text-white/45">নতুন অনুরোধ এলে এখানে দেখানো হবে।</p></div>
        : <div className="space-y-4">{requests.map((item) => (
          <article key={item.request_id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs text-white/40">{formatDate(item.requested_at)}</p><h3 className="mt-2 text-lg font-bold">{item.amount.toLocaleString("en-US")} Eixon</h3>
                <p className="mt-2 text-sm text-white/65">{item.sender_name} <span className="text-white/30">({item.sender_eix_id})</span></p>
                <p className="text-sm text-white/65">→ {item.recipient_name} <span className="text-white/30">({item.recipient_eix_id})</span></p>
                {item.reason && <p className="mt-3 rounded-xl bg-black/20 p-3 text-sm text-white/55">কারণ: {item.reason}</p>}
              </div>
              <span className="rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-3 py-1 text-xs font-semibold text-amber-100">Pending Supreme Approval</span>
            </div>
            <label className="mt-4 block text-xs font-semibold text-white/45" htmlFor={"decision-" + item.request_id}>সিদ্ধান্তের নোট (ঐচ্ছিক)</label>
            <input id={"decision-" + item.request_id} value={notes[item.request_id] ?? ""} maxLength={500}
              onChange={(event) => setNotes((current) => ({ ...current, [item.request_id]: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-emerald-200/40" />
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(busyId)} onClick={() => void decide(item.request_id, "approve")} className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-black text-[#092016] disabled:opacity-50">{busyId === item.request_id ? "সংরক্ষণ হচ্ছে…" : "অনুমোদন"}</button>
              <button type="button" disabled={Boolean(busyId)} onClick={() => void decide(item.request_id, "reject")} className="rounded-full border border-rose-200/25 px-5 py-2.5 text-sm font-bold text-rose-100 hover:bg-rose-200/10 disabled:opacity-50">প্রত্যাখ্যান</button>
            </div>
          </article>
        ))}</div>}
    </section>
  );
}
