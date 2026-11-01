"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";

export default function StaffDashboard() {
  return (
    <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · STAFF WORKSPACE</p>
          <h1 className="text-3xl font-bold">Staff Dashboard</h1>
          <p>View product and stock information according to your permissions.</p>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          <Link href="/admin/products" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <span className="eyebrow">PRODUCTS & INVENTORY</span>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><Icon name="package" size={20} /> View Products & Stock <Icon name="arrow-right" size={17} /></h2>
            <p>View the product list, current inventory, and low-stock status.</p>
          </Link>
          <Link href="/admin/submissions" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><span className="eyebrow">PRODUCT SUBMISSIONS</span><h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><Icon name="tag" size={20} /> Submit Products for Approval <Icon name="arrow-right" size={17} /></h2><p>Submit new product proposals and check their approval status.</p></Link>
          <Link href="/" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <span className="eyebrow">STOREFRONT</span>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><Icon name="globe" size={20} /> View Website <Icon name="arrow-right" size={17} /></h2>
            <p>Return to the NEWEIX storefront.</p>
          </Link>
        </section>
        <p className="mt-6 text-sm">Staff accounts cannot create, edit, or delete products, or manage orders.</p>
      </div>
    </main>
  );
}
