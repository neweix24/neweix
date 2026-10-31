"use client";

import { useEffect, useMemo, useState } from "react";

type Customer = {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  addresses?: Array<{
    label: string; recipient_name: string; phone: string; address_line: string;
    area: string | null; upazila: string | null; district: string; division: string;
    postal_code: string | null; is_default: boolean;
  }>;
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
      [item.full_name, item.display_name, item.email, item.phone].some((value) =>
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
          placeholder="নাম, ইমেইল বা ফোন নম্বর দিয়ে খুঁজুন"
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
              <div className="flex items-center gap-3">
                {customer.avatar_url ? (
                  <img src={customer.avatar_url} alt="" width={48} height={48}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "var(--bg)" }}>
                    {(customer.full_name || customer.display_name || "C").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="font-semibold">{customer.full_name || customer.display_name || "নাম দেওয়া নেই"}</h2>
                  <p className="mt-1 break-all text-sm" style={{ color: "var(--muted)" }}>{customer.email || "ইমেইল পাওয়া যায়নি"}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    {customer.phone || "ফোন নম্বর দেওয়া নেই"} · {customer.phone_verified_at ? "যাচাইকৃত" : "যাচাই হয়নি"}
                  </p>
                  {customer.date_of_birth && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>জন্মতারিখ: {new Date(customer.date_of_birth).toLocaleDateString("bn-BD")}</p>}
                </div>
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
            {customer.addresses && customer.addresses.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <p className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>সংরক্ষিত ডেলিভারি ঠিকানা</p>
                <div className="grid gap-2">
                  {customer.addresses.map((address, index) => (
                    <div key={index} className="rounded-xl p-3 text-sm" style={{ background: "var(--bg)" }}>
                      <p className="font-semibold">{address.label}{address.is_default ? " · ডিফল্ট" : ""}</p>
                      <p>{address.recipient_name} · {address.phone}</p>
                      <p>{[address.address_line, address.area, address.upazila, address.district, address.division, address.postal_code].filter(Boolean).join(", ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 break-all text-xs" style={{ color: "var(--muted)" }}>Customer ID: {customer.user_id}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
