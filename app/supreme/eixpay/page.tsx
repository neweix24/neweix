import { requireStaff } from "@/lib/auth";
import EixPayTransferApprovals from "@/features/supreme/eixpay-transfer-approvals";
export const dynamic = "force-dynamic";
export default async function SupremeEixPayPage() {
  await requireStaff(["supreme"]);
  return (
    <main className="min-h-screen bg-[#080e0b] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">NEWEIX · SUPREME CONTROL</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">EixPay Control</h1>
          <p className="mt-2 text-sm text-white/50">Eixon transfer requests and Supreme decisions.</p>
        </header>
        <EixPayTransferApprovals />
      </div>
    </main>
  );
}
