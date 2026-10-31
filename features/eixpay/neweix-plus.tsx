"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Tier = {
  tier_code: string; display_name: string; tier_rank: number; is_enabled: boolean;
  min_qualified_spend_bdt: number | null; min_qualified_orders: number | null;
  qualification_period_days: number | null; benefits: string[];
};
type Membership = {
  tier_code: string; display_name: string; status: string; starts_at: string;
  expires_at: string | null; benefits: string[];
};
type Payload = { membership_name: string; membership: Membership | null; tiers: Tier[] };
function formatDate(value: string | null) {
  if (!value) return "নির্দিষ্ট মেয়াদ নেই";
  return new Intl.DateTimeFormat("bn-BD", { dateStyle: "long" }).format(new Date(value));
}
export default function NeweixPlus() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/neweix-plus/status", { cache: "no-store" });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) throw new Error(result?.error || "সদস্যপদ লোড করা যায়নি।");
        if (active) setData(result.data as Payload);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "সদস্যপদ লোড করা যায়নি।");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);
  return (
    <main className="min-h-screen bg-[#0b100d] px-4 py-8 text-white sm:px-6 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-200">NEWEIX · Membership</p><h1 className="mt-2 text-4xl font-black tracking-tight">Neweix<span className="text-amber-300">+</span></h1><p className="mt-2 text-sm text-white/55">আপনার সদস্যপদের পরিচয়, স্তর ও বিশেষ সুবিধার কেন্দ্র।</p></div>
          <div className="flex gap-2">
            <Link href="/account/eixpay" className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/75 hover:bg-white/10">EixPay Wallet</Link>
            <Link href="/account" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950">অ্যাকাউন্ট</Link>
          </div>
        </header>
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/60">সদস্যপদের তথ্য লোড হচ্ছে…</div>
        ) : error ? (
          <div className="rounded-3xl border border-amber-200/20 bg-amber-200/[0.06] p-6"><p className="font-semibold text-amber-100">{error}</p><p className="mt-2 text-sm text-white/55">ডেটাবেস migration সম্পন্ন হলে সদস্যপদের তথ্য এখানে দেখা যাবে।</p></div>
        ) : (
          <>
            <section className="relative overflow-hidden rounded-[2rem] border border-amber-100/15 bg-gradient-to-br from-[#543d18] via-[#2c271b] to-[#171914] p-7 sm:p-10">
              <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full border border-amber-100/10" />
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-100/65">Your current membership</p>
              <div className="relative mt-4 flex flex-wrap items-end justify-between gap-5">
                <div><h2 className="text-4xl font-black sm:text-5xl">{data?.membership?.display_name ?? "Free"}</h2><p className="mt-2 text-sm text-amber-50/65">Neweix+ সদস্য</p></div>
                <span className="rounded-full border border-amber-100/25 bg-amber-100/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-100">{data?.membership?.status === "active" ? "Active member" : "Membership status"}</span>
              </div>
              <div className="relative mt-8 grid gap-4 border-t border-amber-100/15 pt-5 sm:grid-cols-2">
                <div><p className="text-xs text-amber-50/50">সদস্যপদ শুরু</p><p className="mt-1 font-semibold">{data?.membership?.starts_at ? formatDate(data.membership.starts_at) : "—"}</p></div>
                <div><p className="text-xs text-amber-50/50">মেয়াদ</p><p className="mt-1 font-semibold">{formatDate(data?.membership?.expires_at ?? null)}</p></div>
              </div>
            </section>
            <section className="mt-8 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Member benefits</p><h2 className="mt-2 text-xl font-bold">আপনার সুবিধা</h2>
                <ul className="mt-5 space-y-3 text-sm text-white/70">
                  {(data?.membership?.benefits ?? ["সাধারণ NEWEIX অ্যাকাউন্ট সুবিধা"]).map((benefit) => <li key={benefit} className="flex gap-3"><span className="text-amber-300">◆</span><span>{benefit}</span></li>)}
                </ul>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Membership ladder</p><h2 className="mt-2 text-xl font-bold">Neweix+ স্তরসমূহ</h2></div><span className="text-xs text-white/40">যোগ্যতা ও সুবিধা Supreme কনফিগার করবেন</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {(data?.tiers ?? []).map((tier) => {
                    const isCurrent = tier.tier_code === data?.membership?.tier_code;
                    const tierClass = isCurrent ? "border-amber-200/35 bg-amber-200/[0.08]" : "border-white/10 bg-black/10";
                    const badgeClass = isCurrent ? "bg-amber-200/15 text-amber-100" : tier.is_enabled ? "bg-emerald-200/10 text-emerald-100" : "bg-white/5 text-white/40";
                    return <div key={tier.tier_code} className={"rounded-2xl border p-4 " + tierClass}>
                      <div className="flex items-center justify-between gap-2"><strong className="text-lg">{tier.display_name}</strong><span className={"rounded-full px-2.5 py-1 text-[10px] font-bold " + badgeClass}>{isCurrent ? "আপনার স্তর" : tier.is_enabled ? "Available" : "Coming soon"}</span></div>
                      <p className="mt-2 text-xs leading-5 text-white/45">{tier.is_enabled ? "এই সদস্যপদ বর্তমানে সক্রিয়।" : "সুবিধা, যোগ্যতা ও মেয়াদ নির্ধারণের পর চালু হবে।"}</p>
                      {(tier.min_qualified_spend_bdt !== null || tier.min_qualified_orders !== null) && (
                        <div className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-white/55">
                          {tier.min_qualified_spend_bdt !== null && <p>যোগ্য কেনাকাটা: ৳{new Intl.NumberFormat("en-US").format(tier.min_qualified_spend_bdt)}</p>}
                          {tier.min_qualified_orders !== null && <p>যোগ্য অর্ডার: {new Intl.NumberFormat("en-US").format(tier.min_qualified_orders)}টি</p>}
                          {tier.qualification_period_days !== null && <p>সময়সীমা: {tier.qualification_period_days} দিন</p>}
                        </div>
                      )}
                    </div>;
                  })}
                </div>
              </div>
            </section>
            <p className="mt-6 text-center text-xs leading-6 text-white/35">Neweix+ সদস্যপদ ও স্তরভিত্তিক সুবিধা NEWEIX-এর নিজস্ব নিয়মে পরিচালিত হবে। মূল্য, আপগ্রেড ও মেয়াদ চালুর আগে নির্ধারিত হবে।</p>
          </>
        )}
      </div>
    </main>
  );
}
