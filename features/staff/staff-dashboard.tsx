"use client";

import Link from "next/link";

export default function StaffDashboard() {
  return (
    <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · STAFF WORKSPACE</p>
          <h1 className="text-3xl font-bold">স্টাফ ড্যাশবোর্ড</h1>
          <p>আপনার অনুমতি অনুযায়ী পণ্য ও স্টকের তথ্য দেখুন।</p>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          <Link href="/admin/products" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <span className="eyebrow">PRODUCTS & INVENTORY</span>
            <h2 className="mt-2 text-xl font-bold">পণ্য ও স্টক দেখুন →</h2>
            <p>পণ্যের তালিকা, বর্তমান মজুত ও কম স্টকের অবস্থা দেখুন।</p>
          </Link>
          <Link href="/admin/submissions" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><span className="eyebrow">PRODUCT SUBMISSIONS</span><h2 className="mt-2 text-xl font-bold">পণ্য অনুমোদনের জন্য জমা দিন →</h2><p>নতুন পণ্যের প্রস্তাব পাঠান এবং অনুমোদনের অবস্থা দেখুন।</p></Link>
          <Link href="/" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <span className="eyebrow">STOREFRONT</span>
            <h2 className="mt-2 text-xl font-bold">ওয়েবসাইট দেখুন →</h2>
            <p>NEWEIX-এর মূল ওয়েবসাইটে ফিরে যান।</p>
          </Link>
        </section>
        <p className="mt-6 text-sm">স্টাফ অ্যাকাউন্ট থেকে পণ্য তৈরি, সম্পাদনা, মুছে ফেলা বা অর্ডার পরিচালনার সুবিধা দেওয়া হয়নি।</p>
      </div>
    </main>
  );
}
