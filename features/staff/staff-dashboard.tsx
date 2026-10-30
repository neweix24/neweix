"use client";

import Link from "next/link";

const destinations = [
  {
    href: "/admin/products",
    eyebrow: "PRODUCTS & INVENTORY",
    title: "পণ্য ও স্টক দেখুন",
    description: "পণ্যের তালিকা, বর্তমান মজুত এবং কম স্টকের অবস্থা পর্যবেক্ষণ করুন।",
    icon: "▦",
  },
  {
    href: "/admin/submissions",
    eyebrow: "PRODUCT SUBMISSIONS",
    title: "পণ্য প্রস্তাব জমা দিন",
    description: "নতুন পণ্যের প্রস্তাব পাঠান এবং অনুমোদনের অগ্রগতি দেখুন।",
    icon: "＋",
  },
  {
    href: "/",
    eyebrow: "STOREFRONT",
    title: "ওয়েবসাইট দেখুন",
    description: "NEWEIX স্টোরফ্রন্টে ফিরে যান।",
    icon: "↗",
  },
];

export default function StaffDashboard() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="relative overflow-hidden rounded-3xl border p-6 sm:p-9" style={{
          borderColor: "var(--border)",
          background: "radial-gradient(ellipse at 88% 0%, rgba(196,243,107,.13), transparent 42%), linear-gradient(135deg, #17251a, #0e1510 72%)",
        }}>
          <p className="neweix-kicker">NEWEIX · STAFF WORKSPACE</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">স্টাফ ড্যাশবোর্ড</h1>
          <p className="mt-3 max-w-2xl text-sm sm:text-base" style={{ color: "var(--muted)" }}>
            আপনার অনুমতি অনুযায়ী পণ্য ও স্টকের তথ্য দেখুন এবং প্রয়োজনীয় পণ্য প্রস্তাব পাঠান।
          </p>
        </header>

        <section aria-label="স্টাফ ব্যবস্থাপনা" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((item) => (
            <Link key={item.href} href={item.href}
              className="group min-w-0 rounded-2xl border p-5 transition duration-200 hover:-translate-y-1 sm:p-6"
              style={{ borderColor: "var(--border)", background: "linear-gradient(145deg, var(--surface-raised), var(--surface))" }}>
              <span className="grid h-11 w-11 place-items-center rounded-xl text-xl font-bold" style={{ background: "var(--brand-lime-soft)", color: "var(--primary)" }}>{item.icon}</span>
              <p className="mt-5 text-[10px] font-extrabold tracking-[1.5px]" style={{ color: "var(--primary)" }}>{item.eyebrow}</p>
              <h2 className="mt-2 text-xl font-extrabold">{item.title} <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span></h2>
              <p className="mt-2 text-sm leading-7" style={{ color: "var(--muted)" }}>{item.description}</p>
            </Link>
          ))}
        </section>

        <p className="mt-6 rounded-xl border px-4 py-3 text-xs leading-6" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
          নিরাপত্তা: স্টাফ অ্যাকাউন্ট থেকে পণ্য তৈরি, সম্পাদনা, মুছে ফেলা বা অর্ডার পরিচালনার অনুমতি নেই।
        </p>
      </div>
    </main>
  );
}
