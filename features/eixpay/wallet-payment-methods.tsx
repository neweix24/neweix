"use client";

import { useState } from "react";
import Link from "next/link";

type SetupChoice = "bkash" | "nagad" | "rocket" | "card";

const providers: { id: SetupChoice; label: string; detail: string }[] = [
  { id: "bkash", label: "bKash", detail: "Mobile financial service" },
  { id: "nagad", label: "Nagad", detail: "Mobile financial service" },
  { id: "rocket", label: "Rocket", detail: "Mobile financial service" },
  { id: "card", label: "Visa / Mastercard", detail: "Credit or debit card" },
];

export default function WalletPaymentMethods() {
  const [choice, setChoice] = useState<SetupChoice | null>(null);

  const selected = providers.find((provider) => provider.id === choice);

  return (
    <section aria-labelledby="wallet-payment-methods" className="mt-7">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Payment center</p>
          <h2 id="wallet-payment-methods" className="mt-1 text-2xl font-black">Payment Methods</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/55">
            MFS ও Card দিয়ে checkout payment করুন; Eixon আপনার NEWEIX reward ledger-এ আলাদাভাবে থাকবে।
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/55">Secure provider connection</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-3xl border border-pink-200/15 bg-gradient-to-br from-pink-200/[0.09] to-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-xl bg-pink-300/15 px-3 py-2 text-sm font-black text-pink-100">MFS</span>
            <span className="text-xs text-amber-200">Setup required</span>
          </div>
          <h3 className="mt-4 text-xl font-bold">Mobile Financial Services</h3>
          <p className="mt-2 text-sm leading-6 text-white/55">bKash, Nagad ও Rocket-এর মাধ্যমে পেমেন্ট। নিজের MFS account যুক্ত করার সুবিধা provider verification চালু হলে সক্রিয় হবে।</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {providers.filter((provider) => provider.id !== "card").map((provider) => (
              <button key={provider.id} type="button" onClick={() => setChoice(provider.id)} className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/10">
                + {provider.label}
              </button>
            ))}
          </div>
          <Link href="/checkout" className="mt-5 inline-flex text-sm font-bold text-pink-100 underline underline-offset-4">Checkout payment options</Link>
        </article>

        <article className="rounded-3xl border border-sky-200/15 bg-gradient-to-br from-sky-200/[0.09] to-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-xl bg-sky-300/15 px-3 py-2 text-sm font-black text-sky-100">CARD</span>
            <span className="text-xs text-amber-200">Gateway required</span>
          </div>
          <h3 className="mt-4 text-xl font-bold">Credit & Debit Cards</h3>
          <p className="mt-2 text-sm leading-6 text-white/55">Visa, Mastercard এবং সমর্থিত card network। Card number বা CVV NEWEIX-এর server-এ সংরক্ষণ করা হবে না।</p>
          <button type="button" onClick={() => setChoice("card")} className="mt-4 rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">+ Add a Card</button>
          <p className="mt-4 text-xs text-white/40">Hosted tokenization ছাড়া card linking চালু হবে না।</p>
        </article>

        <article id="eixon-wallet" className="rounded-3xl border border-emerald-200/20 bg-gradient-to-br from-emerald-200/[0.12] to-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-xl bg-emerald-300/15 px-3 py-2 text-sm font-black text-emerald-100">EIXON</span>
            <span className="text-xs text-emerald-200">Existing ledger</span>
          </div>
          <h3 className="mt-4 text-xl font-bold">Eixon Rewards Wallet</h3>
          <p className="mt-2 text-sm leading-6 text-white/55">আপনার Eixon balance, earned rewards ও ledger activity এখানে থাকবে। এটি নগদ অর্থ বা MFS/Card balance নয়।</p>
          <a href="#eixon-balance" className="mt-5 inline-flex text-sm font-bold text-emerald-100 underline underline-offset-4">View Eixon balance</a>
        </article>
      </div>

      {selected && (
        <div className="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/[0.07] p-5" role="status">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-amber-100">{selected.label} setup is not enabled yet</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-white/65">
                {choice === "card"
                  ? "কার্ড যুক্ত করতে NEWEIX-এ অনুমোদিত payment gateway এবং hosted card tokenization configure করতে হবে। Card number/CVV সরাসরি এখানে দেবেন না।"
                  : "MFS account নিরাপদে যুক্ত করতে সংশ্লিষ্ট provider-এর merchant API, account ownership verification এবং callback validation configure করতে হবে। শুধু ফোন নম্বর লিখে account link করা হবে না।"}
              </p>
              <p className="mt-2 text-xs text-white/45">এই মুহূর্তে কোনো account তথ্য সংরক্ষণ বা payment charge করা হচ্ছে না।</p>
            </div>
            <button type="button" onClick={() => setChoice(null)} className="rounded-full border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10">Close</button>
          </div>
        </div>
      )}
    </section>
  );
}
