import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatMoney(value: number | string | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

const statusLabels: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", processing: "Processing", packed: "Packed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned" };

export default async function OrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/customer-login?next=/orders");

  const { data: orders, error } = await supabase.from("orders").select("id, order_number, status, payment_status, subtotal, delivery_fee, discount, total, created_at, order_items(id, product_name, quantity, unit_price, line_total)").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(50);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><p className="eyebrow">NEWEIX · CUSTOMER ACCOUNT</p><h1 className="text-3xl font-bold">My orders</h1><p>View the orders associated with your account here.</p></div>
          <Link href="/account" className="rounded-xl border px-4 py-2" style={{ borderColor: "var(--border)" }}>Back to account</Link>
        </header>
        {error ? (
          <section className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><p role="alert">Could not load orders. Please try again later.</p></section>
        ) : !orders?.length ? (
          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><h2 className="text-xl font-semibold">No orders are linked to this account yet</h2><p className="mt-2">Use order tracking to view guest orders placed before signing in.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/track-order" className="primary-button">Track order</Link><Link href="/" className="rounded-xl border px-5 py-3" style={{ borderColor: "var(--border)" }}>Start shopping</Link></div></section>
        ) : (
          <div className="grid gap-4">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs" style={{ color: "var(--muted)" }}>Order number</p><h2 className="text-lg font-bold">{order.order_number}</h2><p className="text-sm">{new Date(order.created_at).toLocaleString("en-BD")}</p></div><span className="rounded-full border px-3 py-1 text-sm" style={{ borderColor: "var(--border)" }}>{statusLabels[order.status] ?? order.status}</span></div>
                <div className="mt-4 grid gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>{(order.order_items ?? []).map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.product_name} × {item.quantity}</span><span>{formatMoney(item.line_total ?? Number(item.unit_price) * item.quantity)}</span></div>)}</div>
                <div className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}><span className="text-sm">Payment: {order.payment_status === "paid" ? "Paid" : order.payment_status === "failed" ? "Failed" : "Pending verification/payment"}</span><strong>{formatMoney(order.total)}</strong></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
