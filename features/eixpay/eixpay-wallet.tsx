"use client";
import Link from "next/link";
import EixPayTransferForm from "@/features/eixpay/transfer-request-form";
import Icon from "@/components/ui/icon";
import { useCallback, useEffect, useState } from "react";

type Wallet = {
  wallet_enabled: boolean;
  wallet_name?: string;
  ecosystem_name?: string;
  currency_name?: string;
  eix_id?: string;
  balance?: number;
  lifetime_earned?: number;
  lifetime_spent?: number;
  reward_debt?: number;
  earning_enabled?: boolean;
  redemption_enabled?: boolean;
  transfer_enabled?: boolean;
  transfer_requires_supreme_approval?: boolean;
  membership?: { tier_code: string; display_name: string; status: string; expires_at: string | null } | null;
  referrals?: { total_invited?: number; pending?: number; qualified?: number; rewarded?: number };
};
type Activity = {
  id: number; entry_kind: string; event_code: string; amount: number;
  balance_after: number; created_at: string;
};
type Transfer = {
  request_id: string;
  direction: "sent" | "received";
  counterparty_eix_id: string;
  amount: number;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  reason: string;
  requested_at: string;
  decided_at: string | null;
  decision_note: string;
};
const transferStatusLabels: Record<string, string> = {
  pending: "Supreme অনুমোদনের অপেক্ষায়",
  approved: "অনুমোদিত",
  rejected: "প্রত্যাখ্যাত",
  cancelled: "বাতিল",
  expired: "মেয়াদ শেষ",
};
const eventLabels: Record<string, string> = {
  delivered_order: "অর্ডার রিওয়ার্ড", approved_referral: "রেফারেল রিওয়ার্ড",
  verified_review: "যাচাইকৃত রিভিউ", daily_checkin: "দৈনিক কার্যক্রম",
  campaign_action: "ক্যাম্পেইন রিওয়ার্ড", seller_achievement: "সেলার অর্জন",
  membership_benefit: "মেম্বারশিপ সুবিধা", transfer_in: "Eixon গ্রহণ",
  transfer_out: "Eixon পাঠানো", redemption: "রিওয়ার্ড রিডিম", reversal: "সমন্বয়",
};
function amount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
function date(value: string) {
  return new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export default function EixPayWallet() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [cancelling, setCancelling] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [referralMessage, setReferralMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/eixpay/wallet", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "EixPay লোড করা যায়নি।");
      setWallet({ ...(result.wallet as Wallet), referrals: result.referrals ?? {} });
      setActivity(Array.isArray(result.activity) ? result.activity as Activity[] : []);
      setTransfers(Array.isArray(result.transfers) ? result.transfers as Transfer[] : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "EixPay লোড করা যায়নি।");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function cancelTransfer(requestId: string) {
    if (cancelling) return;
    setCancelling(requestId);
    setError("");
    try {
      const response = await fetch("/api/eixpay/transfers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "অনুরোধ বাতিল করা যায়নি।");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "অনুরোধ বাতিল করা যায়নি।");
    } finally {
      setCancelling("");
    }
  }

  async function shareReferral() {
    if (!wallet?.eix_id) return;
    const link = window.location.origin + "/r/" + wallet.eix_id;
    try {
      if (navigator.share) {
        await navigator.share({ title: "NEWEIX-এ যোগ দিন", text: "আমার EIX Referral Link ব্যবহার করে NEWEIX-এ যোগ দিন।", url: link });
        setReferralMessage("রেফারেল লিংক শেয়ার করা হয়েছে।");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setReferralMessage("রেফারেল লিংক কপি হয়েছে।");
      } else {
        setReferralMessage(link);
      }
    } catch {
      setReferralMessage("রেফারেল লিংক শেয়ার করা যায়নি।");
    }
  }

  async function copyEixId() {
    if (!wallet?.eix_id || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(wallet.eix_id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  }
  return (
    <main className="min-h-screen bg-[#08110d] px-4 py-8 text-white sm:px-6 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">EixVerse · EixPay</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">EixPay Wallet</h1>
            <p className="mt-2 max-w-2xl text-sm text-emerald-50/65">আপনার Eixon ব্যালেন্স, রিওয়ার্ড ও NEWEIX সদস্যপদের কেন্দ্রীয় ওয়ালেট।</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/eixverse" className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/10">EixVerse</Link>
            <Link href="/account" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0a1711] hover:bg-emerald-100">অ্যাকাউন্টে ফিরুন</Link>
          </div>
        </header>
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/70" role="status">EixPay প্রস্তুত হচ্ছে…</div>
        ) : error ? (
          <div className="rounded-3xl border border-amber-300/25 bg-amber-300/10 p-6">
            <p className="font-semibold text-amber-100">{error}</p>
            <p className="mt-2 text-sm text-white/60">ডেটাবেস migration সম্পন্ন হলে ওয়ালেটের তথ্য এখানে দেখা যাবে।</p>
            <button onClick={() => void load()} className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900"><Icon name="refresh" size={16} /> আবার চেষ্টা করুন</button>
          </div>
        ) : wallet?.wallet_enabled === false ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/70">EixPay ওয়ালেট বর্তমানে সাময়িকভাবে বন্ধ।</div>
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[2rem] border border-emerald-200/15 bg-gradient-to-br from-[#154d37] via-[#103c2d] to-[#0d2119] p-6 shadow-2xl shadow-emerald-950/40 sm:p-9">
              <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-emerald-100/10" />
              <div className="pointer-events-none absolute -right-4 -top-12 h-40 w-40 rounded-full border border-emerald-100/10" />
              <div className="relative flex flex-wrap items-start justify-between gap-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-100/65">Available balance</p>
                  <div className="mt-3 flex flex-wrap items-baseline gap-3">
                    <strong className="text-5xl font-black tracking-tight sm:text-6xl">{amount(wallet?.balance ?? 0)}</strong>
                    <span className="text-lg font-semibold text-emerald-100">Eixon</span>
                  </div>
                  <p className="mt-3 text-sm text-emerald-50/65">NEWEIX-এর অভ্যন্তরীণ রিওয়ার্ড ইউনিট</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-black/10 px-4 py-3 backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-50/55">Your EIX ID</p>
                  <div className="mt-1 flex items-center gap-3">
                    <strong className="font-mono text-lg tracking-wider">{wallet?.eix_id ?? "—"}</strong>
                    <button type="button" onClick={() => void copyEixId()} className="rounded-lg border border-white/20 px-2 py-1 text-xs hover:bg-white/10" disabled={!wallet?.eix_id}>
                      <><Icon name="copy" size={14} /> {copied ? "কপি হয়েছে" : "কপি"}</>
                    </button>
                  </div>
                </div>
              </div>
              <div className="relative mt-8 grid grid-cols-2 gap-3 border-t border-white/15 pt-5 sm:max-w-lg">
                <div><p className="text-xs text-emerald-50/55">মোট অর্জন</p><p className="mt-1 text-xl font-bold">{amount(wallet?.lifetime_earned ?? 0)} Eixon</p></div>
                <div><p className="text-xs text-emerald-50/55">মোট ব্যবহার</p><p className="mt-1 text-xl font-bold">{amount(wallet?.lifetime_spent ?? 0)} Eixon</p></div>
              </div>
            </section>
            <div className="mt-4 rounded-2xl border border-sky-200/15 bg-sky-200/[0.06] px-4 py-3 text-sm leading-6 text-sky-100/80">
              Eixon হলো NEWEIX-এর অভ্যন্তরীণ রিওয়ার্ড ইউনিট; এটি নগদ অর্থ, ব্যাংক ব্যালেন্স বা বাইরের পেমেন্ট মাধ্যম নয়।
            </div>
            <section className="mt-5 rounded-2xl border border-emerald-200/15 bg-emerald-200/[0.045] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-200/70">EixVerse Referral</p>
                  <h2 className="mt-2 text-xl font-bold">বন্ধুকে NEWEIX-এ আমন্ত্রণ জানান</h2>
                  <p className="mt-2 text-sm leading-6 text-white/60">আপনার EIX ID-ই রেফারেল কোড। বন্ধু আপনার লিংক দিয়ে নতুন অ্যাকাউন্ট খুলে ফোন যাচাই করে প্রথম যোগ্য অর্ডার সম্পন্ন করলে—নিয়ম চালু থাকলে দুজনই Eixon রিওয়ার্ড পাবেন।</p>
                  <p className="mt-3 font-mono text-sm text-emerald-100">{wallet?.eix_id ?? "—"}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div><p className="text-[10px] text-white/45">মোট আমন্ত্রণ</p><p className="mt-1 font-bold">{amount(wallet?.referrals?.total_invited ?? 0)}</p></div>
                    <div><p className="text-[10px] text-white/45">অপেক্ষমাণ</p><p className="mt-1 font-bold">{amount(wallet?.referrals?.pending ?? 0)}</p></div>
                    <div><p className="text-[10px] text-white/45">যোগ্য</p><p className="mt-1 font-bold">{amount(wallet?.referrals?.qualified ?? 0)}</p></div>
                    <div><p className="text-[10px] text-white/45">রিওয়ার্ডপ্রাপ্ত</p><p className="mt-1 font-bold">{amount(wallet?.referrals?.rewarded ?? 0)}</p></div>
                  </div>
                  {referralMessage && <p role="status" className="mt-2 break-all text-xs text-emerald-200">{referralMessage}</p>}
                </div>
                <button type="button" onClick={() => void shareReferral()} disabled={!wallet?.eix_id} className="rounded-full bg-emerald-200 px-5 py-3 text-sm font-bold text-[#092016] hover:bg-emerald-100 disabled:opacity-50"><Icon name="send" size={16} /> রেফারেল লিংক শেয়ার</button>
              </div>
            </section>
            {(wallet?.reward_debt ?? 0) > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/[0.06] px-4 py-3 text-sm leading-6 text-amber-100/85">
                আগের কোনো অর্ডারের রিটার্ন/রিফান্ড সমন্বয়ের জন্য {amount(wallet?.reward_debt ?? 0)} Eixon ভবিষ্যৎ রিওয়ার্ড থেকে সমন্বয় হবে। আপনার ব্যালেন্স ঋণাত্মক করা হবে না।
              </div>
            )}
            <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link href="/account/neweix-plus" className="group rounded-3xl border border-amber-200/15 bg-gradient-to-br from-amber-200/10 to-white/[0.03] p-5 transition hover:border-amber-200/35">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Membership</p>
                <h2 className="mt-2 text-2xl font-black">Neweix+</h2>
                <p className="mt-2 text-sm text-white/60">বর্তমান সদস্যপদ, স্তর, মেয়াদ ও সদস্য সুবিধা দেখুন।</p>
                <span className="mt-5 inline-block text-sm font-bold text-amber-200">সদস্যপদ দেখুন →</span>
              </Link>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Earn</p>
                <h2 className="mt-2 text-xl font-bold">Eixon Rewards</h2>
                <p className="mt-2 text-sm text-white/55">যোগ্য অর্ডার, যাচাইকৃত রেফারেল ও অনুমোদিত রিভিউয়ের রিওয়ার্ড।</p>
                <span className="mt-5 inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55">{wallet?.earning_enabled ? "প্রোগ্রাম চালু" : "শিগগিরই চালু হবে"}</span>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200">Redeem</p>
                <h2 className="mt-2 text-xl font-bold">Reward Catalog</h2>
                <p className="mt-2 text-sm text-white/55">ভবিষ্যতে কুপন, বিশেষ সুবিধা ও যোগ্য রিওয়ার্ড ব্যবহারের কেন্দ্র।</p>
                <span className="mt-5 inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55">{wallet?.redemption_enabled ? "প্রোগ্রাম চালু" : "আইনি ও সিস্টেম যাচাই চলছে"}</span>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Transfer</p>
                <h2 className="mt-2 text-xl font-bold">Eixon Transfer</h2>
                <p className="mt-2 text-sm text-white/55">ভবিষ্যতে EIX ID দিয়ে ট্রান্সফার অনুরোধ করা যাবে। অনুমোদন ছাড়া ব্যালেন্স পরিবর্তন হবে না।</p>
                <span className="mt-5 inline-flex rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-3 py-1.5 text-xs text-amber-100/80">
                  {wallet?.transfer_enabled ? "Supreme অনুমোদন বাধ্যতামূলক" : "আইনি যাচাই না হওয়া পর্যন্ত বন্ধ"}
                </span>

              {wallet?.transfer_enabled && (
                <EixPayTransferForm onSubmitted={() => void load()} />
              )}
              </div>
              <Link href="/eixverse" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:bg-white/[0.07]">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Ecosystem</p>
                <h2 className="mt-2 text-xl font-bold">EixVerse</h2>
                <p className="mt-2 text-sm text-white/55">রেফারেল, ক্যাম্পেইন, মেম্বারশিপ ও ভবিষ্যতের সব NEWEIX সুবিধা।</p>
                <span className="mt-5 inline-block text-sm font-bold text-emerald-200">ইকোসিস্টেম খুলুন →</span>
              </Link>
            </section>
            <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Wallet activity</p><h2 className="mt-1 text-xl font-bold">সাম্প্রতিক লেনদেন</h2></div>
                <span className="text-xs text-white/45">সর্বশেষ ১২টি কার্যক্রম</span>
              </div>
              {activity.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-white/45">এখনো কোনো Eixon লেনদেন নেই। প্রোগ্রাম চালু হলে এখানে সব কার্যক্রম দেখা যাবে।</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {activity.map((entry) => (
                    <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <div><p className="font-semibold">{eventLabels[entry.event_code] ?? entry.event_code.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-white/45">{date(entry.created_at)}</p></div>
                      <div className="text-right">
                        <p className={entry.entry_kind === "debit" ? "font-bold text-rose-300" : "font-bold text-emerald-300"}>
                          {entry.entry_kind === "debit" ? "−" : "+"}{amount(entry.amount)} Eixon
                        </p>
                        <p className="mt-1 text-xs text-white/45">ব্যালেন্স: {amount(entry.balance_after)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {transfers.length > 0 && (
              <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
                <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Transfer records</p>
                  <h2 className="mt-1 text-xl font-bold">ট্রান্সফার অনুরোধ ও ইতিহাস</h2>
                </div>
                <div className="divide-y divide-white/10">
                  {transfers.map((item) => {
                    const sent = item.direction === "sent";
                    const statusClass = item.status === "approved" ? "text-emerald-200" : item.status === "pending" ? "text-amber-200" : item.status === "rejected" ? "text-rose-200" : "text-white/50";
                    return <div key={item.request_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{sent ? "পাঠানোর অনুরোধ" : "গ্রহণের অনুরোধ"} · <span className="font-mono text-xs text-white/50">{item.counterparty_eix_id}</span></p>
                        <p className="mt-1 text-xs text-white/40">{date(item.requested_at)} · {item.reason || "কোনো কারণ দেওয়া হয়নি"}</p>
                        <p className={"mt-1 text-xs font-semibold " + statusClass}>{transferStatusLabels[item.status] ?? item.status}</p>
                        {item.decision_note && <p className="mt-1 text-xs text-white/40">নোট: {item.decision_note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{sent ? "−" : "+"}{amount(item.amount)} Eixon</p>
                        {sent && item.status === "pending" && (
                          <button type="button" disabled={Boolean(cancelling)} onClick={() => void cancelTransfer(item.request_id)} className="mt-2 rounded-full border border-rose-200/25 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-200/10 disabled:opacity-50">
                            {cancelling === item.request_id ? "বাতিল হচ্ছে…" : "অনুরোধ বাতিল"}
                          </button>
                        )}
                      </div>
                    </div>;
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
