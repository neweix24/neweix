"use client";

import { useCallback, useEffect, useState } from "react";

type OrderItem = {
  id: string;
  product_name_snapshot: string;
  unit_price: number;
  quantity: number;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  phone: string | null;
  address: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  payment_transaction_id: string | null;
  payment_verified_at: string | null;
  created_at: string;
  order_items: OrderItem[];
};

const paymentNames: Record<string, string> = {
  cod: "ক্যাশ অন ডেলিভারি",
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
};

const statusNames: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  verification_pending: "পেমেন্ট যাচাই বাকি",
  paid: "পেমেন্ট সম্পন্ন",
  failed: "ব্যর্থ",
  refunded: "ফেরত দেওয়া হয়েছে",
};

export default function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/orders", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "অর্ডার লোড করা যায়নি।");
      }

      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "অজানা সমস্যা হয়েছে।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function verifyPayment(order: Order) {
    const transactionId = order.payment_transaction_id?.trim();

    if (!transactionId) {
      setError("Transaction ID নেই। এই অর্ডার যাচাই করা যাবে না।");
      return;
    }

    const confirmed = window.confirm(
      `অর্ডার ${order.order_number}\n` +
        `পেমেন্ট: ${paymentNames[order.payment_method] || order.payment_method}\n` +
        `Transaction ID: ${transactionId}\n\n` +
        "আপনি কি পেমেন্ট প্রদানকারীর রেকর্ডে এই লেনদেন যাচাই করেছেন? নিশ্চিত হলেই Paid করুন।"
    );

    if (!confirmed) return;

    setBusyId(order.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "পেমেন্ট যাচাই করা যায়নি।");
      }

      setNotice(`${order.order_number}: পেমেন্ট Paid হয়েছে; অডিট লগ সংরক্ষিত হয়েছে।`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "অজানা সমস্যা হয়েছে।");
    } finally {
      setBusyId("");
    }
  }

  const visibleOrders = orders.filter((order) => {
    if (filter === "all") return true;
    if (filter === "mobile") return order.payment_method !== "cod";
    return order.payment_status === filter;
  });

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">অর্ডার তালিকা</h2>
        <button
          type="button"
          onClick={() => void loadOrders()}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "লোড হচ্ছে..." : "রিফ্রেশ"}
        </button>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        সর্বশেষ ১০০টি অর্ডার দেখানো হবে। পেমেন্ট যাচাইয়ের আগে bKash, Nagad বা Rocket-এর
        নিজস্ব রেকর্ডে Transaction ID, পরিমাণ ও প্রাপকের তথ্য মিলিয়ে নিন।
      </p>

      <label className="mt-5 block max-w-sm text-sm font-medium">
        ফিল্টার
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2"
        >
          <option value="all">সব অর্ডার</option>
          <option value="mobile">মোবাইল পেমেন্ট</option>
          <option value="verification_pending">পেমেন্ট যাচাই বাকি</option>
          <option value="paid">পেমেন্ট সম্পন্ন</option>
          <option value="pending">অপেক্ষমাণ</option>
          <option value="failed">ব্যর্থ</option>
          <option value="refunded">ফেরত দেওয়া হয়েছে</option>
        </select>
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-gray-600">অর্ডার লোড হচ্ছে...</p>
      ) : visibleOrders.length === 0 ? (
        <p className="py-8 text-gray-600">এই ফিল্টারে কোনো অর্ডার পাওয়া যায়নি।</p>
      ) : (
        <div className="mt-5 space-y-4">
          {visibleOrders.map((order) => (
            <article key={order.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{order.order_number}</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    {order.customer_name} · {order.customer_phone || order.phone || "ফোন নেই"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(order.created_at).toLocaleString("bn-BD")}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-bold">৳{Number(order.total).toLocaleString("bn-BD")}</p>
                  <p className="mt-1 text-sm">
                    {paymentNames[order.payment_method] || order.payment_method}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {statusNames[order.payment_status] || order.payment_status}
                  </p>
                </div>
              </div>

              <p className="mt-3 break-words text-sm text-gray-700">
                ঠিকানা: {order.shipping_address || order.address || "ঠিকানা নেই"}
                {order.shipping_city ? `, ${order.shipping_city}` : ""}
              </p>

              {order.payment_transaction_id && (
                <p className="mt-2 break-all text-sm">
                  <span className="font-medium">Transaction ID: </span>
                  {order.payment_transaction_id}
                </p>
              )}

              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="mb-2 text-sm font-semibold">পণ্যসমূহ</p>
                {(order.order_items || []).map((item) => (
                  <p key={item.id} className="text-sm text-gray-600">
                    {item.product_name_snapshot} × {item.quantity} — ৳
                    {(Number(item.unit_price) * Number(item.quantity)).toLocaleString("bn-BD")}
                  </p>
                ))}
              </div>

              {order.payment_verified_at && (
                <p className="mt-3 text-xs text-green-700">
                  যাচাই হয়েছে: {new Date(order.payment_verified_at).toLocaleString("bn-BD")}
                </p>
              )}

              {order.payment_status === "verification_pending" &&
                ["bkash", "nagad", "rocket"].includes(order.payment_method) && (
                  <button
                    type="button"
                    onClick={() => void verifyPayment(order)}
                    disabled={busyId !== ""}
                    className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyId === order.id ? "সংরক্ষণ হচ্ছে..." : "যাচাই করে Paid করুন"}
                  </button>
                )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
