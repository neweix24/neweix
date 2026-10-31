"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import EixVerseMissions from "@/features/eixverse/eixverse-missions";
type ModuleItem = { module_code: string; display_name: string; description: string; status: "active" | "planned" | "disabled"; sort_order: number };
const destinations: Record<string, string> = { eixpay: "/account/eixpay", neweix_plus: "/account/neweix-plus", campaigns: "#missions" };
export default function EixVerseHub() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/eixverse/modules", { cache: "no-store" });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) throw new Error(result?.error || "EixVerse লোড করা যায়নি।");
        const rows = result.data?.modules;
        if (active) setModules(Array.isArray(rows) ? rows as ModuleItem[] : []);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "EixVerse লোড করা যায়নি।");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);
  return (
    <main className="min-h-screen bg-[#080e0b] px-4 py-10 text-white sm:px-6 lg:py-16">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-300">NEWEIX · Digital ecosystem</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight sm:text-6xl">Eix<span className="text-emerald-300">Verse</span></h1>
          <p className="mt-4 text-base leading-7 text-white/55">NEWEIX-এর পুরস্কার, ওয়ালেট, মেম্বারশিপ, রেফারেল ও সদস্য সুবিধাগুলোর একক ইকোসিস্টেম।</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/account/eixpay" className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-black text-[#092016]">EixPay খুলুন</Link>
            <Link href="/account/neweix-plus" className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-white/80 hover:bg-white/10">Neweix+ সদস্যপদ</Link>
          </div>
        </header>
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">One connected system</p><h2 className="mt-2 text-2xl font-bold">EixVerse Modules</h2></div><span className="text-xs text-white/35">EixPay · Eixon · Neweix+</span></div>
          {loading ? (
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-sm text-white/50">ইকোসিস্টেম মডিউল লোড হচ্ছে…</div>
          ) : error ? (
            <div className="mt-5 rounded-3xl border border-amber-200/20 bg-amber-200/[0.06] p-6 text-sm text-amber-100">{error}</div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module) => {
                const href = destinations[module.module_code];
                const activeCard = module.status === "active";
                const cardClass = activeCard ? "border-emerald-200/20 bg-gradient-to-br from-emerald-200/[0.09] to-white/[0.025] hover:border-emerald-200/40" : "border-white/10 bg-white/[0.025]";
                const badgeClass = activeCard ? "bg-emerald-200/15 text-emerald-100" : "bg-white/5 text-white/40";
                const card = <div className={"h-full rounded-3xl border p-6 transition " + cardClass}>
                  <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-200">{module.module_code.replaceAll("_", " ")}</span><span className={"rounded-full px-3 py-1 text-[10px] font-bold " + badgeClass}>{module.status === "active" ? "Active" : module.status === "planned" ? "Planned" : "Disabled"}</span></div>
                  <h3 className="mt-4 text-xl font-bold">{module.display_name}</h3><p className="mt-2 text-sm leading-6 text-white/50">{module.description}</p><p className="mt-5 text-xs font-semibold text-emerald-200">{href ? "খুলুন →" : "পরিকল্পনায় আছে"}</p>
                </div>;
                return href ? <Link key={module.module_code} href={href}>{card}</Link> : <div key={module.module_code}>{card}</div>;
              })}
            </div>
          )}
        </section>
        <div id="missions"><EixVerseMissions /></div>
      </div>
    </main>
  );
}
