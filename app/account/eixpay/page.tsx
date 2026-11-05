import EixPayWallet from "@/features/eixpay/eixpay-wallet";
import WalletPaymentMethods from "@/features/eixpay/wallet-payment-methods";

export const dynamic = "force-dynamic";

// Customer authentication and verified-phone enforcement are centralized in
// middleware. Avoid a second server-component Auth lookup that can race with
// Supabase refresh-token rotation during App Router navigation.
export default function EixPayPage() {
  return (
    <>
      <EixPayWallet />
      <section className="bg-[#08110d] px-4 py-8 text-white sm:px-6 lg:py-12">
        <div className="mx-auto max-w-6xl">
          <WalletPaymentMethods />
        </div>
      </section>
    </>
  );
}
