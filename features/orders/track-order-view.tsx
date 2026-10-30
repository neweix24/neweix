"use client";

import Link from "next/link";

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
  pending: "অর্ডার গ্রহণের অপেক্ষায়",
  confirmed: "অর্ডার নিশ্চিত হয়েছে",
  processing: "অর্ডার প্রস্তুত হচ্ছে",
  shipped: "অর্ডার পাঠানো হয়েছে",
  delivered: "অর্ডার পৌঁছে গেছে",
  cancelled: "অর্ডার বাতিল হয়েছে",
  paid: "পেমেন্ট সম্পন্ন",
  unpaid: "পেমেন্ট বাকি",
  failed: "পেমেন্ট ব্যর্থ",
  refunded: "টাকা ফেরত দেওয়া হয়েছে",
};

function getStatusLabel(status: string | null | undefined) {
  if (!status) return "তথ্য পাওয়া যায়নি";
  return statusLabels[status.toLowerCase()] ?? status;
}

function formatDate(date: string | null) {
  if (!date) return "তথ্য পাওয়া যায়নি";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "তথ্য পাওয়া যায়নি";
  }

  return new Intl.DateTimeFormat("bn-BD", {
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
      setError("অর্ডার নম্বর ও ফোন নম্বর—দুটিই লিখুন।");
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
            "অর্ডারের তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।"
        );
        return;
      }

      setOrder(result.order);
    } catch {
      setError(
        "সার্ভারের সঙ্গে যোগাযোগ করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-12" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <section className="mx-auto w-full max-w-2xl">\n        <nav className="mb-8 flex flex-wrap justify-between gap-4 text-sm font-semibold">\n          <Link href="/" style={{ color: "var(--primary)" }}>← NEWEIX হোম</Link>\n          <Link href="/products" style={{ color: "var(--muted)" }}>পণ্য দেখুন</Link>\n        </nav>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            অর্ডার ট্র্যাক করুন
          </h1>

          <p className="mt-3" style={{ color: "var(--muted)" }}>
            আপনার অর্ডারের বর্তমান অবস্থা জানতে নিচের তথ্য দিন।
          </p>
        </div>

        <div className="rounded-2xl border p-6 shadow-sm sm:p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="orderNumber"
                className="mb-2 block text-sm font-medium"
              >
                অর্ডার নম্বর
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
                placeholder="যেমন: NWX-10001"
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
                অর্ডার করার সময় ব্যবহৃত ফোন নম্বর
              </label>

              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="আপনার ফোন নম্বর"
                maxLength={30}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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
              className="w-full rounded-lg px-5 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60" style={{ background: "var(--primary)", color: "#10170d" }}
            >
              {loading ? "অর্ডার খোঁজা হচ্ছে..." : "অর্ডার খুঁজুন"}
            </button>
          </form>
        </div>

        {order && (
          <section
            aria-live="polite"
            className="mt-6 rounded-2xl border p-6 shadow-sm sm:p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  অর্ডার নম্বর
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {order.order_number}
                </h2>
              </div>

              <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={{ background: "var(--surface-raised)", color: "var(--primary)" }}>
                {getStatusLabel(order.status)}
              </span>
            </div>

            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              <InfoRow
                label="অর্ডারের তারিখ"
                value={formatDate(order.created_at)}
              />

              <InfoRow
                label="পেমেন্ট পদ্ধতি"
                value={order.payment_method || "তথ্য পাওয়া যায়নি"}
              />

              <InfoRow
                label="পেমেন্টের অবস্থা"
                value={getStatusLabel(order.payment_status)}
              />

              <InfoRow
                label="ডেলিভারির অবস্থা"
                value={getStatusLabel(order.delivery_status)}
              />

              <InfoRow
                label="কুরিয়ার ট্র্যাকিং নম্বর"
                value={
                  order.delivery_tracking_code ||
                  "এখনো দেওয়া হয়নি"
                }
              />
            </div>

            <p className="mt-5 rounded-lg p-3 text-sm" style={{ background: "var(--surface-raised)", color: "var(--muted)" }}>
              ডেলিভারি সংক্রান্ত আরও তথ্যের জন্য আমাদের
              কাস্টমার সাপোর্টের সঙ্গে যোগাযোগ করুন।
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