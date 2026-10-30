"use client";

import { useCallback, useEffect, useState } from "react";

type OrderItem = {
  id: string;
  product_name: string;
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

const paymentStatusNames: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  verification_pending: "পেমেন্ট যাচাই বাকি",
  paid: "পেমেন্ট সম্পন্ন",
  failed: "ব্যর্থ",
  refunded: "ফেরত দেওয়া হয়েছে",
};

const orderStatusNames: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  confirmed: "নিশ্চিত",
  processing: "প্রসেসিং",
  packed: "প্যাক করা হয়েছে",
  shipped: "পাঠানো হয়েছে",
  delivered: "ডেলিভারি সম্পন্ন",
  cancelled: "বাতিল",
  returned: "ফেরত এসেছে",
};

const orderStatuses = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
] as const;

export default function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [statusBusyId, setStatusBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

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
      setError(
        err instanceof Error ? err.message : "অজানা সমস্যা হয়েছে।"
      );
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
        "পেমেন্ট প্রদানকারীর রেকর্ডে লেনদেন যাচাই করেছেন কি? নিশ্চিত হলেই Paid করুন।"
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

      setNotice(
        `${order.order_number}: পেমেন্ট Paid হয়েছে; অডিট লগ সংরক্ষিত হয়েছে।`
      );

      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "অজানা সমস্যা হয়েছে।"
      );
    } finally {
      setBusyId("");
    }
  }

  async function updateOrderStatus(order: Order, newStatus: string) {
    if (newStatus === order.status) return;

    const statusName = orderStatusNames[newStatus] || newStatus;

    const confirmed = window.confirm(
      `অর্ডার: ${order.order_number}\n` +
        `বর্তমান Status: ${orderStatusNames[order.status] || order.status}\n` +
        `নতুন Status: ${statusName}\n\n` +
        "আপনি কি এই পরিবর্তনটি সংরক্ষণ করতে চান?"
    );

    if (!confirmed) return;

    setStatusBusyId(order.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          status: newStatus,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "অর্ডারের Status পরিবর্তন করা যায়নি।"
        );
      }

      setNotice(
        `${order.order_number}: Status "${statusName}" সংরক্ষণ হয়েছে।`
      );

      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "অর্ডারের Status পরিবর্তনে সমস্যা হয়েছে।"
      );
    } finally {
      setStatusBusyId("");
    }
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();

  const visibleOrders = orders.filter((order) => {
    const matchesSearch =
      normalizedSearch === "" ||
      [
        order.order_number,
        order.customer_name,
        order.customer_phone || "",
        order.phone || "",
      ].some((value) =>
        value.toLocaleLowerCase().includes(normalizedSearch)
      );

    const matchesStatus =
      statusFilter === "all" || order.status === statusFilter;

    const matchesPayment =
      paymentFilter === "all"
        ? true
        : paymentFilter === "mobile"
          ? order.payment_method !== "cod"
          : order.payment_status === paymentFilter;

    return matchesSearch && matchesStatus && matchesPayment;
  });

  return (
    <section className="neweix-panel rounded-xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">অর্ডার তালিকা</h2>

        <button
          type="button"
          onClick={() => void loadOrders()}
          disabled={loading}
          className="neweix-button-secondary text-sm disabled:opacity-50"
        >
          {loading ? "লোড হচ্ছে..." : "রিফ্রেশ"}
        </button>
      </div>

      <p className="mt-2 text-sm">
        সর্বশেষ ১০০টি অর্ডার দেখানো হবে। মোবাইল পেমেন্ট Paid করার আগে
        সংশ্লিষ্ট পেমেন্ট প্রদানকারীর রেকর্ডে Transaction ID, পরিমাণ ও
        প্রাপকের তথ্য মিলিয়ে নিন।
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm font-medium sm:col-span-2 lg:col-span-3">
          অর্ডার খুঁজুন
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="অর্ডার নম্বর, গ্রাহকের নাম বা ফোন নম্বর"
            className="mt-1 block w-full rounded-lg border p-2"
          />
        </label>

        <label className="block text-sm font-medium">
          অর্ডারের Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="mt-1 block w-full rounded-lg border p-2"
          >
            <option value="all">সব Status</option>
            {orderStatuses.map((status) => (
              <option key={status} value={status}>
                {orderStatusNames[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          পেমেন্ট ফিল্টার
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="mt-1 block w-full rounded-lg border p-2"
          >
            <option value="all">সব পেমেন্ট</option>
            <option value="mobile">মোবাইল পেমেন্ট</option>
            <option value="verification_pending">পেমেন্ট যাচাই বাকি</option>
            <option value="paid">পেমেন্ট সম্পন্ন</option>
            <option value="pending">পেমেন্ট অপেক্ষমাণ</option>
            <option value="failed">পেমেন্ট ব্যর্থ</option>
            <option value="refunded">পেমেন্ট ফেরত দেওয়া হয়েছে</option>
          </select>
        </label>
      </div>

      <p className="mt-3 text-sm">
        {visibleOrders.length}টি অর্ডার পাওয়া গেছে।
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="mt-4 rounded-lg border p-3 text-sm"
        >
          {notice}
        </p>
      )}

      {loading ? (
        <p className="py-8">অর্ডার লোড হচ্ছে...</p>
      ) : visibleOrders.length === 0 ? (
        <p className="py-8">
          এই সার্চ বা ফিল্টারে কোনো অর্ডার পাওয়া যায়নি।
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {visibleOrders.map((order) => (
            <article
              key={order.id}
              className="rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{order.order_number}</h3>
                  <p className="mt-1 text-sm">
                    {order.customer_name} ·{" "}
                    {order.customer_phone || order.phone || "ফোন নেই"}
                  </p>
                  <p className="mt-1 text-xs">
                    {new Date(order.created_at).toLocaleString("bn-BD")}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="font-bold">
                    ৳{Number(order.total).toLocaleString("bn-BD")}
                  </p>
                  <p className="mt-1 text-sm">
                    {paymentNames[order.payment_method] || order.payment_method}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    পেমেন্ট:{" "}
                    {paymentStatusNames[order.payment_status] ||
                      order.payment_status}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    অর্ডার:{" "}
                    {orderStatusNames[order.status] || order.status}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border p-3">
                <label className="block text-sm font-medium">
                  অর্ডারের Status পরিবর্তন
                  <select
                    value={order.status}
                    onChange={(event) =>
                      void updateOrderStatus(order, event.target.value)
                    }
                    disabled={
                      statusBusyId !== "" ||
                      busyId !== "" ||
                      loading
                    }
                    className="mt-1 block w-full rounded-lg border p-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {orderStatuses.map((status) => (
                      <option key={status} value={status}>
                        {orderStatusNames[status]}
                      </option>
                    ))}
                  </select>
                </label>

                {statusBusyId === order.id && (
                  <p className="mt-2 text-sm">
                    Status সংরক্ষণ হচ্ছে...
                  </p>
                )}
              </div>

              <p className="mt-3 break-words text-sm">
                ঠিকানা:{" "}
                {order.shipping_address || order.address || "ঠিকানা নেই"}
                {order.shipping_city ? `, ${order.shipping_city}` : ""}
              </p>

              {order.payment_transaction_id && (
                <p className="mt-2 break-all text-sm">
                  <span className="font-medium">Transaction ID: </span>
                  {order.payment_transaction_id}
                </p>
              )}

              <div className="mt-3 border-t pt-3">
                <p className="mb-2 text-sm font-semibold">পণ্যসমূহ</p>
                {(order.order_items || []).map((item) => (
                  <p key={item.id} className="text-sm">
                    {item.product_name} × {item.quantity} — ৳
                    {(
                      Number(item.unit_price) * Number(item.quantity)
                    ).toLocaleString("bn-BD")}
                  </p>
                ))}
              </div>

              {order.payment_verified_at && (
                <p className="mt-3 text-xs">
                  যাচাই হয়েছে:{" "}
                  {new Date(order.payment_verified_at).toLocaleString("bn-BD")}
                </p>
              )}

              {order.payment_status === "verification_pending" &&
                ["bkash", "nagad", "rocket"].includes(
                  order.payment_method
                ) && (
                  <button
                    type="button"
                    onClick={() => void verifyPayment(order)}
                    disabled={busyId !== "" || statusBusyId !== ""}
                    className="neweix-button-primary mt-4 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyId === order.id
                      ? "সংরক্ষণ হচ্ছে..."
                      : "যাচাই করে Paid করুন"}
                  </button>
                )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
