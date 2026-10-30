"use client";

import { useEffect, useMemo, useState } from "react";

type Customer = {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  phone: string | null;
  created_at: string;
  order_summary?: { count: number; total: number; lastOrder: string | null; lastStatus: string | null };
};

export default function CustomersManager() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin/customers", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "কাস্টমার তালিকা লোড করা যায়নি।");
        if (active) setCustomers(Array.isArray(result.customers) ? result.customers : []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "সার্ভারে সমস্যা হয়েছে।");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return customers;
    return customers.filter((item) =>
      [item.full_name, item.display_name, item.phone].some((value) =>
        (value ?? "").toLocaleLowerCase().includes(term)
      )
    );
  }, [customers, search]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          নিবন্ধিত কাস্টমার: <strong>{customers.length}</strong> (সর্বশেষ ১০০টি প্রোফাইল)
        </p>
        <input
          aria-label="কাস্টমার খুঁজুন"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="নাম বা ফোন নম্বর দিয়ে খুঁজুন"
          className="min-h-11 w-full rounded-xl border px-4 sm:max-w-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}
        />
      </div>
      {loading && <p role="status">কাস্টমার তথ্য লোড হচ্ছে…</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!loading && !error && filtered.length === 0 && <p>কোনো কাস্টমার পাওয়া যায়নি।</p>}
      <div className="grid gap-3">
        {filtered.map((customer) => (
          <article key={customer.user_id} className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">{customer.full_name || customer.display_name || "নাম দেওয়া নেই"}</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{customer.phone || "ফোন নম্বর দেওয়া নেই"}</p>
              </div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                যোগ দিয়েছেন: {new Date(customer.created_at).toLocaleDateString("bn-BD")}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl p-3" style={{ background: "var(--bg)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>অর্ডার</p>
                <strong>{customer.order_summary?.count ?? 0}</strong>
              </div>
              <div className="rounded-xl p-3" style={{ background: "var(--bg)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>মোট অর্ডার মূল্য</p>
                <strong>{new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(customer.order_summary?.total ?? 0)}</strong>
              </div>
              <div className="rounded-xl p-3 col-span-2 sm:col-span-1" style={{ background: "var(--bg)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>সর্বশেষ অর্ডার</p>
                <strong className="text-sm">{customer.order_summary?.lastOrder ? new Date(customer.order_summary.lastOrder).toLocaleDateString("bn-BD") : "নেই"}</strong>
              </div>
            </div>
            <p className="mt-3 break-all text-xs" style={{ color: "var(--muted)" }}>Customer ID: {customer.user_id}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
