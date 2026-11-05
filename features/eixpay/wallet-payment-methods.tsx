"use client";

import Link from "next/link";

const mfsProviders = ["bKash", "Nagad", "Rocket"];

export default function WalletPaymentMethods() {
  return (
    <section aria-labelledby="wallet-payment-methods" className="mt-7">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Payment center</p>
          <h2 id="wallet-payment-methods" className="mt-1 text-2xl font-black">Payment Methods</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/55">
            Checkout-এ MFS দিয়ে পেমেন্ট করতে পারবেন। Eixon আপনার NEWEIX rewards ledger-এ আলাদাভাবে থাকবে।
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">Payment verification required</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-pink-200/15 bg-gradient-to-br from-pink-200/[0.09] to-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-xl bg-pink-300/15 px-3 py-2 text-sm font-black text-pink-100">MFS</span>
            <span className="text-xs text-emerald-200">Manual payment active</span>
          </div>
          <h3 className="mt-4 text-xl font-bold">Mobile Financial Services</h3>
          <p className="mt-2 text-sm leading-6 text-white/65">
            {mfsProviders.join(", ")} দিয়ে checkout-এর সময় পেমেন্ট করতে পারবেন। Checkout page-এ প্রতিটি পদ্ধতির বর্তমান payment number দেখানো হবে।
          </p>
          <p className="mt-3 text-xs leading-5 text-white/45">
            Transaction ID জমা দিলেই পেমেন্ট সফল হবে না। Admin যাচাই না করা পর্যন্ত পেমেন্ট Pending থাকবে।
          </p>
          <Link href="/checkout" className="mt-5 inline-flex rounded-full bg-pink-200 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-pink-100">
            Go to checkout
          </Link>
        </article>

        <article className="rounded-3xl border border-sky-200/15 bg-gradient-to-br from-sky-200/[0.09] to-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-xl bg-sky-300/15 px-3 py-2 text-sm font-black text-sky-100">CARD</span>
            <span className="text-xs text-amber-200">Not available yet</span>
          </div>
          <h3 className="mt-4 text-xl font-bold">Credit & Debit Cards</h3>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Visa ও Mastercard payment চালু করতে NEWEIX-এর অনুমোদিত payment gateway merchant account প্রয়োজন।
          </p>
          <button type="button" disabled aria-disabled="true" className="mt-4 cursor-not-allowed rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/45">
            Card payments coming later
          </button>
          <p className="mt-4 text-xs text-white/40">
            Gateway ও hosted tokenization ছাড়া card number বা security code নেওয়া হবে না।
          </p>
        </article>

        <article className="rounded-3xl border border-emerald-200/20 bg-gradient-to-br from-emerald-200/[0.12] to-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-xl bg-emerald-300/15 px-3 py-2 text-sm font-black text-emerald-100">EIXON</span>
            <span className="text-xs text-emerald-200">Existing ledger</span>
          </div>
          <h3 className="mt-4 text-xl font-bold">Eixon Rewards Wallet</h3>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Eixon balance, earned rewards ও ledger activity আপনার বিদ্যমান Eixon wallet-এ থাকবে। এটি নগদ অর্থ বা MFS/Card balance নয়।
          </p>
          <p className="mt-5 text-sm font-semibold text-emerald-100">
            Eixon balance is displayed in your wallet overview above.
          </p>
        </article>
      </div>
    </section>
  );
}
