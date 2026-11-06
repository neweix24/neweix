"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
};

type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number | string;
  delivery_fee: number | string;
  discount: number | string;
  total: number | string;
  created_at: string;
  updated_at: string;
  delivery_status: string;
  delivery_tracking_code: string | null;
  delivery_provider: string | null;
  delivered_at: string | null;
  shipping_address: string;
  shipping_city: string | null;
  shipping_division: string | null;
  shipping_district: string | null;
  shipping_upazila: string | null;
  shipping_union: string | null;
  shipping_union_other: string | null;
  shipping_village: string | null;
  order_items: OrderItem[];
};

type ApiResponse = { order?: Order; error?: string };

const labels: Record<string, string> = {
  pending: "Pending confirmation",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  paid: "Paid",
  unpaid: "Payment pending",
  failed: "Payment failed",
  refunded: "Refunded",
};

function statusLabel(value: string | null | undefined) {
  if (!value) return "Not available";
  return labels[value.toLowerCase()] ?? value.replaceAll("_", " ");
}

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function date(value: string | null | undefined) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export default function CustomerOrderDetail({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/account/orders/${encodeURIComponent(orderId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as ApiResponse;
        if (!response.ok || !result.order) {
          setError(result.error || "Could not load this order.");
          return;
        }
        setOrder(result.order);
      } catch {
        if (!controller.signal.aborted) {
          setError("Could not connect to the server. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [orderId]);

  return (
    <main className="premium-order-detail min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-3xl">
        <Link href="/orders" className="text-sm font-semibold" style={{ color: "var(--primary)" }}>← Back to my orders</Link>
        <header className="mb-7 mt-5">
          <p className="eyebrow">NEWEIX · CUSTOMER ACCOUNT</p>
          <h1 className="text-3xl font-bold">Order details</h1>
          <p className="mt-2" style={{ color: "var(--muted)" }}>A secure view of the order linked to your account.</p>
        </header>

        {loading ? (
          <section aria-live="polite" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>Loading order details…</section>
        ) : error ? (
          <section role="alert" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h2 className="text-lg font-semibold">Order unavailable</h2>
            <p className="mt-2">{error}</p>
            <Link href="/orders" className="mt-4 inline-flex rounded-xl px-4 py-2 font-semibold" style={{ background: "var(--primary)", color: "#08100a" }}>Return to my orders</Link>
          </section>
        ) : order ? (
          <div className="grid gap-5">
            <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs" style={{ color: "var(--muted)" }}>Order number</p><h2 className="text-xl font-bold">{order.order_number}</h2><p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{date(order.created_at)}</p></div>
                <span className="rounded-full border px-3 py-1 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>{statusLabel(order.status)}</span>
              </div>
              <div className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2" style={{ borderColor: "var(--border)" }}>
                <div><p className="text-xs" style={{ color: "var(--muted)" }}>Payment</p><p className="font-semibold">{statusLabel(order.payment_status)} · {order.payment_method.toUpperCase()}</p></div>
                <div><p className="text-xs" style={{ color: "var(--muted)" }}>Delivery</p><p className="font-semibold">{statusLabel(order.delivery_status)}</p></div>
                {order.delivery_tracking_code ? <div><p className="text-xs" style={{ color: "var(--muted)" }}>Tracking code</p><p className="font-semibold">{order.delivery_tracking_code}</p></div> : null}
                {order.delivery_provider ? <div><p className="text-xs" style={{ color: "var(--muted)" }}>Delivery partner</p><p className="font-semibold">{order.delivery_provider}</p></div> : null}
              </div>
            </section>

            <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-lg font-bold">Items</h2>
              <div className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
                {(order.order_items ?? []).map((item) => (
                  <div key={item.id} className="flex justify-between gap-4 py-3 text-sm">
                    <div><p className="font-semibold">{item.product_name}</p><p style={{ color: "var(--muted)" }}>Qty {item.quantity} × {money(item.unit_price)}</p></div>
                    <strong className="shrink-0">{money(item.line_total)}</strong>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
                <MoneyRow label="Subtotal" value={money(order.subtotal)} />
                <MoneyRow label="Delivery fee" value={money(order.delivery_fee)} />
                <MoneyRow label="Discount" value={`−${money(order.discount)}`} />
                <div className="flex justify-between gap-3 pt-2 text-base font-bold"><span>Total</span><span>{money(order.total)}</span></div>
              </div>
            </section>

            <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-lg font-bold">Delivery address</h2>
              <p className="mt-3 leading-7">{order.shipping_address}</p>
              <p style={{ color: "var(--muted)" }}>{[order.shipping_village, order.shipping_union_other || order.shipping_union, order.shipping_upazila, order.shipping_district || order.shipping_city, order.shipping_division].filter(Boolean).join(", ")}</p>
              {order.delivered_at ? <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>Delivered: {date(order.delivered_at)}</p> : null}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span style={{ color: "var(--muted)" }}>{label}</span><span>{value}</span></div>;
}
