import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import EixVerseCampaignControl from "@/features/supreme/eixverse-campaign-control";
export const dynamic = "force-dynamic";
export default async function SupremeEixVersePage() {
  const staff = await requireStaff(["supreme"]);
  return <main className="min-h-screen bg-[#080e0b] px-4 py-10 text-white sm:px-6">
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.25em] text-emerald-300">NEWEIX · SUPREME CONTROL</p><h1 className="mt-2 text-3xl font-black">EixVerse Campaigns & Missions</h1><p className="mt-2 text-sm text-white/50">Supreme MFA protected · Role: {staff.role}</p></div>
        <nav className="flex gap-4 text-sm"><Link href="/supreme/eixpay" className="underline">EixPay</Link><Link href="/supreme" className="underline">Dashboard</Link></nav>
      </header>
      <EixVerseCampaignControl />
    </div>
  </main>;
}
