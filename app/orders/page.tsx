import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatMoney(value: number | string | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

const statusLabels: Record<string, string> = { pending: "অপেক্ষমাণ", confirmed: "নিশ্চিত", processing: "প্রস্তুত হচ্ছে", packed: "প্যাক করা হয়েছে", shipped: "পাঠানো হয়েছে", delivered: "ডেলিভারি সম্পন্ন", cancelled: "বাতিল", returned: "ফেরত" };

export default async function OrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/customer-login?next=/orders");

  const { data: orders, error } = await supabase.from("orders").select("id, order_number, status, payment_status, subtotal, delivery_fee, discount, total, created_at, order_items(id, product_name, quantity, unit_price, line_total)").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(50);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><p className="eyebrow">NEWEIX · CUSTOMER ACCOUNT</p><h1 className="text-3xl font-bold">আমার অর্ডার</h1><p>আপনার অ্যাকাউন্টের সঙ্গে যুক্ত অর্ডারগুলো এখানে দেখুন।</p></div>
          <Link href="/account" className="rounded-xl border px-4 py-2" style={{ borderColor: "var(--border)" }}>অ্যাকাউন্টে ফিরুন</Link>
        </header>
        {error ? (
          <section className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><p role="alert">অর্ডার লোড করা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।</p></section>
        ) : !orders?.length ? (
          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><h2 className="text-xl font-semibold">এখনো কোনো অ্যাকাউন্ট-যুক্ত অর্ডার নেই</h2><p className="mt-2">লগইন করার আগে করা Guest Order দেখতে অর্ডার ট্র্যাকিং ব্যবহার করুন।</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/track-order" className="primary-button">অর্ডার ট্র্যাক করুন</Link><Link href="/" className="rounded-xl border px-5 py-3" style={{ borderColor: "var(--border)" }}>শপিং শুরু করুন</Link></div></section>
        ) : (
          <div className="grid gap-4">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs" style={{ color: "var(--muted)" }}>অর্ডার নম্বর</p><h2 className="text-lg font-bold">{order.order_number}</h2><p className="text-sm">{new Date(order.created_at).toLocaleString("bn-BD")}</p></div><span className="rounded-full border px-3 py-1 text-sm" style={{ borderColor: "var(--border)" }}>{statusLabels[order.status] ?? order.status}</span></div>
                <div className="mt-4 grid gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>{(order.order_items ?? []).map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.product_name} × {item.quantity}</span><span>{formatMoney(item.line_total ?? Number(item.unit_price) * item.quantity)}</span></div>)}</div>
                <div className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}><span className="text-sm">পেমেন্ট: {order.payment_status === "paid" ? "পরিশোধিত" : order.payment_status === "failed" ? "ব্যর্থ" : "যাচাই/পরিশোধ অপেক্ষমাণ"}</span><strong>{formatMoney(order.total)}</strong></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
