"use client";
import { useState, type FormEvent } from "react";

export default function EixPayTransferForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const numericAmount = Number(amount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount < 1) {
      setError("পূর্ণসংখ্যায় সঠিক Eixon পরিমাণ দিন।");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/eixpay/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEixId: recipient.trim().toUpperCase(),
          amount: numericAmount,
          reason: reason.trim(),
          requestKey: "eix-" + crypto.randomUUID(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "অনুরোধ পাঠানো যায়নি।");
      setMessage("অনুরোধ Supreme-এর অনুমোদনের অপেক্ষায় আছে। এখনো কোনো Eixon কাটা হয়নি।");
      setRecipient("");
      setAmount("");
      setReason("");
      onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "অনুরোধ পাঠানো যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3 rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.04] p-4">
      <div><h3 className="font-bold text-cyan-100">Eixon পাঠানোর অনুরোধ</h3><p className="mt-1 text-xs leading-5 text-white/50">প্রাপকের EIX ID ও পরিমাণ দিন। Supreme অনুমোদন না হওয়া পর্যন্ত আপনার ব্যালেন্স অপরিবর্তিত থাকবে।</p></div>
      <label className="block text-xs font-semibold text-white/55" htmlFor="eix-recipient">প্রাপকের EIX ID</label>
      <input id="eix-recipient" value={recipient} onChange={(event) => setRecipient(event.target.value.toUpperCase())} maxLength={12} required placeholder="EIX-XXXXXXXX" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 font-mono text-sm text-white outline-none focus:border-cyan-200/40" />
      <label className="block text-xs font-semibold text-white/55" htmlFor="eix-amount">Eixon পরিমাণ</label>
      <input id="eix-amount" type="number" inputMode="numeric" min="1" step="1" max="1000000000" value={amount} onChange={(event) => setAmount(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-cyan-200/40" />
      <label className="block text-xs font-semibold text-white/55" htmlFor="eix-reason">কারণ (ঐচ্ছিক)</label>
      <input id="eix-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-cyan-200/40" />
      {message && <p className="text-sm text-emerald-200" role="status">{message}</p>}
      {error && <p className="text-sm text-rose-200" role="alert">{error}</p>}
      <button type="submit" disabled={busy || !recipient.trim() || !amount} className="rounded-full bg-cyan-200 px-5 py-2.5 text-sm font-black text-[#092016] disabled:opacity-50">{busy ? "অনুরোধ পাঠানো হচ্ছে…" : "অনুমোদনের অনুরোধ পাঠান"}</button>
    </form>
  );
}
