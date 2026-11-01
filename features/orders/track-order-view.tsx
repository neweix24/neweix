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

type ApiResponse = {
  success: boolean;
  error?: string;
  order?: Order;
};

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
  return statusLabels[status.toLowerCase()] ?? status;
}

function formatDate(date: string | null) {
  if (!date) return "Information unavailable";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Information unavailable";
  }

  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
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
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          order_number: cleanOrderNumber,
          phone: cleanPhone,
        }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success || !result.order) {
        setError(
          result.error ||
            "Order information could not be found. Please try again."
        );
        return;
      }

      setOrder(result.order);
    } catch {
      setError(
        "Could not connect to the server. Check your internet connection."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-12" style={{ background: "radial-gradient(ellipse at 85% 0%, rgba(182,255,74,.14), transparent 38%), linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)", color: "var(--ink)" }}>
      <section className="mx-auto w-full max-w-3xl">
        <nav className="mb-8 flex flex-wrap justify-between gap-4 text-sm font-semibold">
          <Link href="/" style={{ color: "var(--primary)" }}>← NEWEIX Home</Link>
          <Link href="/products" style={{ color: "var(--muted)" }}>Browse products</Link>
        </nav>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Track your order
          </h1>

          <p className="mt-3" style={{ color: "var(--muted)" }}>
            Enter the details below to check your order status.
          </p>
        </div>

        <div className="rounded-3xl border p-6 shadow-sm sm:p-8" style={{ borderColor: "#dfeade", background: "rgba(255,255,255,.96)", boxShadow: "0 14px 38px rgba(45,110,65,.07)" }}>
          <form onSubmit={handleSubmit} className="space-y-5">\n            <p className="text-sm leading-6" style={{ color: "var(--muted)" }}>For privacy, enter the same phone number you provided when placing the order. Your order details are shown only after the details are verified.</p>
            <div>
              <label
                htmlFor="orderNumber"
                className="mb-2 block text-sm font-medium"
              >
                Order number
              </label>

              <input
                id="orderNumber"
                name="order_number"
                type="text"
                autoComplete="off"
                value={orderNumber}
                onChange={(event) =>
                  setOrderNumber(event.target.value)
                }
                placeholder="Example: NWX-10001"
                maxLength={60}
                required
                className="w-full rounded-lg border px-4 py-3 outline-none transition" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--ink)" }}
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="mb-2 block text-sm font-medium"
              >
                Phone number used when placing the order
              </label>

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
                className="w-full rounded-lg border px-4 py-3 outline-none transition focus-visible:ring-2" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--ink)" }}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface)" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg px-5 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60" style={{ background: "var(--primary)", color: "#080b09" }}
            >
              <><Icon name={loading ? "refresh" : "search"} size={17} /> {loading ? "Searching for your order..." : "Find order"}</>
            </button>
          </form>
        </div>

        {order && (
          <section
            aria-live="polite"
            className="mt-6 rounded-3xl border p-6 shadow-sm sm:p-8" style={{ borderColor: "#dfeade", background: "rgba(255,255,255,.97)", boxShadow: "0 14px 38px rgba(45,110,65,.07)" }}
          >
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Order number
                </p>

                <h2 className="mt-1 text-xl font-black">
                  {order.order_number}
                </h2>
              </div>

              <span className="rounded-full border px-4 py-2 text-sm font-extrabold" style={{ borderColor: "#b8dfad", background: "#f1ffeb", color: "#28633e" }}>
                {getStatusLabel(order.status)}
              </span>
            </div>

            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              <InfoRow
                label="Order date"
                value={formatDate(order.created_at)}
              />

              <InfoRow
                label="Payment method"
                value={order.payment_method || "Information unavailable"}
              />

              <InfoRow
                label="Payment status"
                value={getStatusLabel(order.payment_status)}
              />

              <InfoRow
                label="Delivery status"
                value={getStatusLabel(order.delivery_status)}
              />

              <InfoRow
                label="Courier tracking number"
                value={
                  order.delivery_tracking_code ||
                  "Not available yet"
                }
              />
            </div>

            <p className="mt-5 rounded-xl border p-4 text-sm leading-6" style={{ borderColor: "#e3eee0", background: "#f7fcf4", color: "var(--muted)" }}>
              For more information about your delivery, please contact customer support.
            </p>
          </section>
        )}
      </section>
    </main>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="text-sm" style={{ color: "var(--muted)" }}>{label}</span>
      <span className="break-words text-sm font-medium sm:text-right" style={{ color: "var(--ink)" }}>
        {value}
      </span>
    </div>
  );
}