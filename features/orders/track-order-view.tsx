"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { FormEvent, useState } from "react";

type Order = {
  order_number: string;
  status: string | null;
  payment_method: string | null;
  payment_status: string | null;
  created_at: string | null;
  delivery_status: string | null;
  delivery_tracking_code: string | null;
};

type ApiResponse = { success: boolean; error?: string; order?: Order };

const statusLabels: Record<string, string> = {
  pending: "Pending confirmation",
  confirmed: "Order confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  paid: "Paid",
  unpaid: "Payment pending",
  failed: "Payment failed",
  refunded: "Refunded",
};

function getStatusLabel(status: string | null | undefined) {
  if (!status) return "Information unavailable";
  return statusLabels[status.toLowerCase()] ?? status.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Information unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Information unavailable";
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6" style={{ borderColor: "var(--border)" }}>
      <span className="text-sm" style={{ color: "var(--muted)" }}>{label}</span>
      <span className="break-words text-sm font-semibold sm:text-right" style={{ color: "var(--navy)" }}>{value}</span>
    </div>
  );
}

export default function TrackOrderView() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOrder(null);

    const cleanOrderNumber = orderNumber.trim();
    const cleanPhone = phone.trim();
    if (!cleanOrderNumber || !cleanPhone) {
      setError("Enter both your order number and phone number.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ order_number: cleanOrderNumber, phone: cleanPhone }),
      });
      const result = (await response.json()) as ApiResponse;
      if (!response.ok || !result.success || !result.order) {
        setError(result.error || "Order information could not be found. Please check the details and try again.");
        return;
      }
      setOrder(result.order);
    } catch {
      setError("Could not connect to the server. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="premium-track-order min-h-screen px-4 py-10 sm:px-6 sm:py-14" style={{ color: "var(--navy)" }}>
      <div className="mx-auto w-full max-w-4xl">
        <nav className="mb-8 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold">
          <Link href="/" className="inline-flex items-center gap-2"><Icon name="arrow-left" size={16} /> NEWEIX Home</Link>
          <Link href="/products" style={{ color: "var(--muted)" }}>Browse products <Icon name="arrow-right" size={14} /></Link>
        </nav>

        <header className="mb-8 grid gap-5 rounded-3xl border p-6 sm:grid-cols-[1fr_auto] sm:items-end sm:p-9" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, var(--surface-raised), var(--surface-soft))", boxShadow: "0 18px 50px rgba(20,43,59,.06)" }}>
          <div>
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[.16em]" style={{ borderColor: "rgba(8,127,99,.2)", background: "rgba(8,127,99,.07)", color: "var(--emerald)" }}>
              <Icon name="truck" size={14} /> Order updates
            </span>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Track your order</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 sm:text-base" style={{ color: "var(--muted)" }}>
              Follow your NEWEIX order. Enter the order number and the phone number used at checkout to securely view its latest status.
            </p>
          </div>
          <div className="hidden h-20 w-20 items-center justify-center rounded-2xl sm:flex" style={{ background: "rgba(8,127,99,.09)", color: "var(--emerald)" }}>
            <Icon name="package" size={38} />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[.92fr_1.08fr]">
          <section className="premium-track-card rounded-3xl border p-6 sm:p-8" style={{ borderColor: "var(--border)", background: "var(--surface-raised)", boxShadow: "0 14px 38px rgba(20,43,59,.055)" }}>
            <div className="mb-6">
              <h2 className="text-xl font-bold">Find your order</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--muted)" }}>Use the same contact number you provided when placing the order.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-2">
                <label htmlFor="orderNumber" className="text-sm font-semibold">Order number</label>
                <input
                  id="orderNumber"
                  name="order_number"
                  type="text"
                  autoComplete="off"
                  value={orderNumber}
                  onChange={(event) => setOrderNumber(event.target.value)}
                  placeholder="Example: NWX-10001"
                  maxLength={60}
                  required
                  className="w-full rounded-xl border px-4 py-3.5 text-sm outline-none transition focus-visible:ring-2"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--navy)", outlineColor: "var(--emerald)" }}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="phone" className="text-sm font-semibold">Phone number used at checkout</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Your phone number"
                  maxLength={30}
                  required
                  className="w-full rounded-xl border px-4 py-3.5 text-sm outline-none transition focus-visible:ring-2"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--navy)", outlineColor: "var(--emerald)" }}
                />
              </div>

              {error && <p role="alert" className="rounded-xl border p-3 text-sm leading-6" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface)" }}>{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "var(--emerald)", color: "#fff" }}
              >
                <Icon name={loading ? "refresh" : "search"} size={17} />
                {loading ? "Finding your order…" : "Find my order"}
              </button>
              <p className="text-xs leading-5" style={{ color: "var(--muted)" }}>
                <Icon name="shield" size={13} /> Your order details appear only after the order number and phone number are verified.
              </p>
            </form>
          </section>

          <section aria-live="polite" className="min-w-0">
            {order ? (
              <div className="premium-track-card h-full rounded-3xl border p-6 sm:p-8" style={{ borderColor: "var(--border)", background: "var(--surface-raised)", boxShadow: "0 14px 38px rgba(20,43,59,.055)" }}>
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em]" style={{ color: "var(--muted)" }}>Order found</p>
                    <h2 className="mt-1 text-2xl font-bold">{order.order_number}</h2>
                    <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{formatDate(order.created_at)}</p>
                  </div>
                  <span className="rounded-full border px-3 py-1.5 text-xs font-bold" style={{ borderColor: "rgba(8,127,99,.25)", background: "rgba(8,127,99,.08)", color: "var(--emerald)" }}>
                    {getStatusLabel(order.status)}
                  </span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  <InfoRow label="Order status" value={getStatusLabel(order.status)} />
                  <InfoRow label="Payment method" value={order.payment_method || "Information unavailable"} />
                  <InfoRow label="Payment status" value={getStatusLabel(order.payment_status)} />
                  <InfoRow label="Delivery status" value={getStatusLabel(order.delivery_status)} />
                  <InfoRow label="Courier tracking number" value={order.delivery_tracking_code || "Not available yet"} />
                </div>
                <div className="mt-5 rounded-2xl p-4" style={{ background: "var(--surface-soft)" }}>
                  <p className="text-sm font-semibold">Need help with this delivery?</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: "var(--muted)" }}>Our support team can help with order and delivery questions.</p>
                  <Link href="/contact" className="mt-3 inline-flex items-center gap-2 text-sm font-bold" style={{ color: "var(--emerald)" }}>Contact support <Icon name="arrow-right" size={15} /></Link>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-64 flex-col justify-center rounded-3xl border p-7 sm:p-9" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,.55)" }}>
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(8,127,99,.09)", color: "var(--emerald)" }}><Icon name="package" size={25} /></span>
                <h2 className="text-xl font-bold">Your delivery, clearly tracked</h2>
                <p className="mt-2 max-w-sm text-sm leading-6" style={{ color: "var(--muted)" }}>Once you submit your details, the latest order, payment and courier information will appear here.</p>
                <ul className="mt-6 grid gap-3 text-sm" style={{ color: "var(--muted)" }}>
                  <li className="flex items-center gap-2"><Icon name="check-circle" size={16} /> Order confirmation status</li>
                  <li className="flex items-center gap-2"><Icon name="check-circle" size={16} /> Payment verification status</li>
                  <li className="flex items-center gap-2"><Icon name="check-circle" size={16} /> Courier tracking reference</li>
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
