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
  shipping_division_code: string | null;
  shipping_division: string | null;
  shipping_district_code: string | null;
  shipping_district: string | null;
  shipping_upazila_code: string | null;
  shipping_upazila: string | null;
  shipping_union_code: string | null;
  shipping_union: string | null;
  shipping_union_other: string | null;
  shipping_village: string | null;
  status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  payment_transaction_id: string | null;
  payment_verified_at: string | null;
  delivery_fee_payment_method: string | null;
  delivery_fee_payment_transaction_id: string | null;
  delivery_fee_payment_status: string;
  delivery_fee_payment_verified_at: string | null;
  delivery_provider?: string | null;
  delivery_status?: string | null;
  delivery_consignment_id?: string | null;
  delivery_tracking_code?: string | null;
  delivery_booked_at?: string | null;
  delivery_error?: string | null;
  stock_restored_at?: string | null;
  stock_restoration_note?: string | null;
  created_at: string;
  order_items: OrderItem[];
};

const paymentNames: Record<string, string> = {
  cod: "Cash on Delivery",
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
};

const paymentStatusNames: Record<string, string> = {
  pending: "Pending",
  verification_pending: "Payment Verification Pending",
  paid: "Payment Completed",
  failed: "Failed",
  refunded: "Refunded",
  not_required: "Not Required",
};

const orderStatusNames: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
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
        throw new Error(result.error || "Could not load orders.");
      }

      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred."
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
      setError("Transaction ID is missing. This order cannot be verified.");
      return;
    }

    const confirmed = window.confirm(
      `Order ${order.order_number}\n` +
        `Payment: ${paymentNames[order.payment_method] || order.payment_method}\n` +
        `Transaction ID: ${transactionId}\n\n` +
        "Have you verified the transaction in the payment provider's records? Mark it as Paid only when confirmed."
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
        throw new Error(result.error || "Could not verify the payment.");
      }

      setNotice(
        `${order.order_number}: Payment marked as Paid; audit log saved.`
      );

      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
    } finally {
      setBusyId("");
    }
  }

  async function verifyDeliveryFee(order: Order) {
    const transactionId = order.delivery_fee_payment_transaction_id?.trim();
    if (!transactionId) {
      setError("Delivery fee transaction ID is missing.");
      return;
    }
    const confirmed = window.confirm(
      `Order ${order.order_number}\nDelivery Fee: BDT ${Number(order.delivery_fee).toLocaleString("en-BD")}\nMFS: ${paymentNames[order.delivery_fee_payment_method || ""] || order.delivery_fee_payment_method}\nTransaction ID: ${transactionId}\n\nHave you confirmed receipt of the delivery fee in the payment provider's records?`
    );
    if (!confirmed) return;
    setBusyId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action: "verify_delivery_fee" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not verify the delivery fee.");
      setNotice(`${order.order_number}: Delivery fee marked as Paid.`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the delivery fee.");
    } finally {
      setBusyId("");
    }
  }

  async function createPathaoShipment(order: Order) {
    const rawStoreId = window.prompt("Enter the Pathao Merchant Store ID:");
    if (!rawStoreId) return;
    const storeId = Number(rawStoreId.trim());
    if (!Number.isSafeInteger(storeId) || storeId < 1) {
      setError("Enter a valid Pathao Store ID.");
      return;
    }
    const defaultAddress = [order.shipping_address || order.address, order.shipping_village, order.shipping_union_other || order.shipping_union, order.shipping_upazila, order.shipping_district || order.shipping_city, order.shipping_division].filter(Boolean).join(", ");
    const recipientAddress = window.prompt(
      "Enter the full Pathao address (street/area, upazila/police station, district):",
      defaultAddress,
    );
    if (!recipientAddress || recipientAddress.trim().length < 10 || recipientAddress.trim().length > 220) {
      setError("Enter a complete Pathao address between 10 and 220 characters.");
      return;
    }
    const specialInstruction = window.prompt("Delivery instructions (optional):") || "";
    if (specialInstruction.length > 500) {
      setError("Instructions must be 500 characters or fewer.");
      return;
    }
    if (!window.confirm(`Book order ${order.order_number} with Pathao?\nCOD to collect: ৳${Number(order.total).toLocaleString("en-BD")}`)) return;

    setBusyId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_order", orderId: order.id, storeId, recipientAddress: recipientAddress.trim(), specialInstruction }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pathao booking failed.");
      setNotice(`${order.order_number}: Pathao Consignment ID ${result.consignmentId} was created.`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pathao booking failed.");
      await loadOrders();
    } finally {
      setBusyId("");
    }
  }

  async function trackPathaoShipment(order: Order) {
    const consignmentId = order.delivery_consignment_id || order.delivery_tracking_code;
    if (!consignmentId) return;
    setBusyId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/pathao?action=track&consignmentId=${encodeURIComponent(consignmentId)}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Tracking information is unavailable.");
      setNotice(`${order.order_number}: Pathao tracking data refreshed.`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tracking information is unavailable.");
    } finally {
      setBusyId("");
    }
  }

  async function restockReturnedOrder(order: Order) {
    const note = window.prompt("Enter the reason for restocking inspected returned items (5–500 characters):");
    if (!note || note.trim().length < 5 || note.trim().length > 500) {
      if (note !== null) setError("The reason must be between 5 and 500 characters.");
      return;
    }
    if (!window.confirm(`Have the returned items for order ${order.order_number} been inspected and approved for restocking?`)) return;
    setBusyId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restock_returned", orderId: order.id, note: note.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not restock returned items.");
      setNotice(`${order.order_number}: Returned items have been restocked.`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restock returned items.");
    } finally {
      setBusyId("");
    }
  }

  async function updateOrderStatus(order: Order, newStatus: string) {
    if (newStatus === order.status) return;

    const statusName = orderStatusNames[newStatus] || newStatus;

    const confirmed = window.confirm(
      `Order: ${order.order_number}\n` +
        `Current Status: ${orderStatusNames[order.status] || order.status}\n` +
        `New Status: ${statusName}\n\n` +
        "Do you want to save this change?"
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
          result.error || "Could not update the order status."
        );
      }

      setNotice(
        `${order.order_number}: Status "${statusName}" saved.`
      );

      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not change the order status."
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
        <h2 className="text-xl font-semibold">Order List</h2>

        <button
          type="button"
          onClick={() => void loadOrders()}
          disabled={loading}
          className="neweix-button-secondary text-sm disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <p className="mt-2 text-sm">
        The latest 100 orders are shown. Before marking a mobile payment as Paid,
        verify the transaction ID, amount, and
        recipient details in the payment provider&apos;s records.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm font-medium sm:col-span-2 lg:col-span-3">
          Search Orders
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order number, customer name, or phone number"
            className="mt-1 block w-full rounded-lg border p-2"
          />
        </label>

        <label className="block text-sm font-medium">
          Order Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="mt-1 block w-full rounded-lg border p-2"
          >
            <option value="all">All Statuses</option>
            {orderStatuses.map((status) => (
              <option key={status} value={status}>
                {orderStatusNames[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          Payment Filter
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="mt-1 block w-full rounded-lg border p-2"
          >
            <option value="all">All Payments</option>
            <option value="mobile">Mobile Payments</option>
            <option value="verification_pending">Payment Verification Pending</option>
            <option value="paid">Payment Completed</option>
            <option value="pending">Payment Pending</option>
            <option value="failed">Payment Failed</option>
            <option value="refunded">Payment Refunded</option>
          </select>
        </label>
      </div>

      <p className="mt-3 text-sm">
        {visibleOrders.length} orders found.
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
        <p className="py-8">Loading orders...</p>
      ) : visibleOrders.length === 0 ? (
        <p className="py-8">
          No orders match this search or filter.
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
                    {order.customer_phone || order.phone || "No phone number"}
                  </p>
                  <p className="mt-1 text-xs">
                    {new Date(order.created_at).toLocaleString("en-BD")}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="font-bold">
                    ৳{Number(order.total).toLocaleString("en-BD")}
                  </p>
                  <p className="mt-1 text-sm">
                    {paymentNames[order.payment_method] || order.payment_method}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    Payment:{" "}
                    {paymentStatusNames[order.payment_status] ||
                      order.payment_status}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    Order:{" "}
                    {orderStatusNames[order.status] || order.status}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border p-3">
                <label className="block text-sm font-medium">
                  Update Order Status
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
                    Saving status...
                  </p>
                )}
              </div>

              {order.status === "returned" && (
                <div className="mt-3 rounded-lg border border-dashed p-3">
                  {order.stock_restored_at ? (
                    <p className="text-sm">
                      Stock restocked: {new Date(order.stock_restored_at).toLocaleString("en-BD")}
                      {order.stock_restoration_note ? ` · ${order.stock_restoration_note}` : ""}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm">Inspect the returned products and quantities before adding them back to inventory.</p>
                      <button
                        type="button"
                        onClick={() => void restockReturnedOrder(order)}
                        disabled={busyId !== "" || statusBusyId !== ""}
                        className="neweix-button-secondary mt-2 disabled:opacity-50"
                      >
                        {busyId === order.id ? "Restocking..." : "Restock inspected returned items"}
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="mt-3 rounded-lg border border-dashed p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Pathao Courier</p>
                  <span className="text-xs">Status: {order.delivery_status || "not_booked"}</span>
                </div>
                {order.delivery_consignment_id && (
                  <p className="mt-1 break-all text-xs">
                    Consignment ID: {order.delivery_consignment_id}
                  </p>
                )}
                {order.delivery_error && (
                  <p role="alert" className="mt-2 text-xs">{order.delivery_error}</p>
                )}
                {order.delivery_booked_at && (
                  <p className="mt-1 text-xs">
                    Booked: {new Date(order.delivery_booked_at).toLocaleString("en-BD")}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(!order.delivery_consignment_id && ["not_booked", "failed"].includes(order.delivery_status || "not_booked")) && (
                    <button
                      type="button"
                      onClick={() => void createPathaoShipment(order)}
                      disabled={busyId !== "" || statusBusyId !== ""}
                      className="neweix-button-primary disabled:opacity-50"
                    >
                      {busyId === order.id ? "Booking with Pathao..." : "Book with Pathao"}
                    </button>
                  )}
                  {order.delivery_consignment_id && (
                    <button
                      type="button"
                      onClick={() => void trackPathaoShipment(order)}
                      disabled={busyId !== "" || statusBusyId !== ""}
                      className="neweix-button-secondary disabled:opacity-50"
                    >
                      {busyId === order.id ? "Refreshing tracking..." : "Refresh Pathao Tracking"}
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-3 break-words text-sm">
                Address:{" "}
                {order.shipping_address || order.address || "No address"}
                {[
                  order.shipping_village,
                  order.shipping_union_other || order.shipping_union,
                  order.shipping_upazila,
                  order.shipping_district || order.shipping_city,
                  order.shipping_division,
                ].filter(Boolean).map((part) => `, ${part}`).join("")}
              </p>

              {order.payment_transaction_id && (
                <p className="mt-2 break-all text-sm">
                  <span className="font-medium">Transaction ID: </span>
                  {order.payment_transaction_id}
                </p>
              )}

              {order.payment_method === "cod" && Number(order.delivery_fee) > 0 && (
                <div className="mt-3 rounded-lg border p-3">
                  <p className="text-sm font-semibold">Delivery Fee Prepayment</p>
                  <p className="mt-1 text-sm">Amount: ৳{Number(order.delivery_fee).toLocaleString("en-BD")}</p>
                  <p className="mt-1 text-sm">MFS: {paymentNames[order.delivery_fee_payment_method || ""] || order.delivery_fee_payment_method || "Not selected"}</p>
                  <p className="mt-1 break-all text-sm">TrxID: {order.delivery_fee_payment_transaction_id || "Not available"}</p>
                  <p className="mt-1 text-sm">Status: {paymentStatusNames[order.delivery_fee_payment_status] || order.delivery_fee_payment_status}</p>
                  {order.delivery_fee_payment_status === "verification_pending" && (
                    <button
                      type="button"
                      onClick={() => void verifyDeliveryFee(order)}
                      disabled={busyId !== "" || statusBusyId !== ""}
                      className="neweix-button-primary mt-3 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === order.id ? "Saving..." : "Verify Delivery Fee and Mark as Paid"}
                    </button>
                  )}
                </div>
              )}

              <div className="mt-3 border-t pt-3">
                <p className="mb-2 text-sm font-semibold">Products</p>
                {(order.order_items || []).map((item) => (
                  <p key={item.id} className="text-sm">
                    {item.product_name} × {item.quantity} — ৳
                    {(
                      Number(item.unit_price) * Number(item.quantity)
                    ).toLocaleString("en-BD")}
                  </p>
                ))}
              </div>

              {order.payment_verified_at && (
                <p className="mt-3 text-xs">
                  Verified:{" "}
                  {new Date(order.payment_verified_at).toLocaleString("en-BD")}
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
                      ? "Saving..."
                      : "Verify and Mark as Paid"}
                  </button>
                )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
