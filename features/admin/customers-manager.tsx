"use client";

import { useEffect, useState } from "react";

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

type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

const money = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
});

const orderStatusLabels: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
};

export default function CustomersManager() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, page_size: 25, total: 0, total_pages: 0, has_next: false, has_previous: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (search.trim()) params.set("q", search.trim());
        const response = await fetch(`/api/admin/customers?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load the customer list.");
        setCustomers(Array.isArray(result.customers) ? result.customers : []);
        if (result.pagination) setPagination(result.pagination as Pagination);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "A server error occurred.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, search]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Registered customers: <strong>{pagination.total.toLocaleString("en-BD")}</strong>
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            per page {pagination.page_size} জন · server-side search
          </p>
        </div>
        <input
          aria-label="Search customers"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search by name, email, or phone number"
          maxLength={80}
          className="min-h-11 w-full rounded-xl border px-4 sm:max-w-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}
        />
      </div>
      {loading && <p role="status">Loading customer information…</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!loading && !error && customers.length === 0 && <p>No customers found.</p>}
      <div className="grid gap-3">
        {customers.map((customer) => (
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
                  <h2 className="font-semibold">{customer.full_name || customer.display_name || "Name not provided"}</h2>
                  <p className="mt-1 break-all text-sm" style={{ color: "var(--muted)" }}>{customer.email || "Email unavailable"}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                    {customer.phone || "Phone number not provided"} · {customer.phone_verified_at ? "Verified" : "Not verified"}
                  </p>
                  {customer.date_of_birth && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Date of birth: {new Date(customer.date_of_birth).toLocaleDateString("en-BD")}</p>}
                </div>
              </div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Joined: {new Date(customer.created_at).toLocaleDateString("en-BD")}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl p-3" style={{ background: "var(--bg)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Orders (excluding cancelled/returned)</p>
                <strong>{(customer.order_summary?.count ?? 0).toLocaleString("en-BD")}</strong>
              </div>
              <div className="rounded-xl p-3" style={{ background: "var(--bg)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Order value (excluding cancelled/returned)</p>
                <strong>{money.format(customer.order_summary?.total ?? 0)}</strong>
              </div>
              <div className="rounded-xl p-3 col-span-2 sm:col-span-1" style={{ background: "var(--bg)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>Latest active order</p>
                <strong className="text-sm">
                  {customer.order_summary?.lastOrder
                    ? `${new Date(customer.order_summary.lastOrder).toLocaleDateString("en-BD")} · ${orderStatusLabels[customer.order_summary.lastStatus ?? ""] ?? customer.order_summary.lastStatus ?? ""}`
                    : "None"}
                </strong>
              </div>
            </div>
            {customer.addresses && customer.addresses.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <p className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>Saved delivery addresses</p>
                <div className="grid gap-2">
                  {customer.addresses.map((address, index) => (
                    <div key={index} className="rounded-xl p-3 text-sm" style={{ background: "var(--bg)" }}>
                      <p className="font-semibold">{address.label}{address.is_default ? " · Default" : ""}</p>
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
      {pagination.total_pages > 1 && (
        <nav aria-label="Customer list pages" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Page {pagination.page.toLocaleString("en-BD")} / {pagination.total_pages.toLocaleString("en-BD")}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={!pagination.has_previous || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
              style={{ borderColor: "var(--border)" }}>আগের Page</button>
            <button type="button" disabled={!pagination.has_next || loading}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
              style={{ borderColor: "var(--border)" }}>পরের Page</button>
          </div>
        </nav>
      )}
    </section>
  );
}
