"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Review = {
  review_id: string;
  rating: number;
  title: string;
  body: string;
  reviewer_name: string;
  created_at: string;
};
type EligibleOrder = {
  order_item_id: string;
  order_number: string;
  product_name: string;
  quantity: number;
  purchased_at: string;
};

function reviewDate(value: string) {
  return new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium" }).format(new Date(value));
}

export default function ProductReviewPanel({ productId, returnTo }: { productId: string; returnTo: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/reviews?productId=" + encodeURIComponent(productId), { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "রিভিউ লোড করা যায়নি।");
      setReviews(Array.isArray(result.reviews) ? result.reviews as Review[] : []);
      setEligibleOrders(Array.isArray(result.eligibleOrders) ? result.eligibleOrders as EligibleOrder[] : []);
      setAuthenticated(Boolean(result.authenticated));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "রিভিউ লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!orderItemId) { setError("যে অর্ডারের পণ্যটি পেয়েছেন সেটি নির্বাচন করুন।"); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, orderItemId, rating, title, body }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "রিভিউ জমা দেওয়া যায়নি।");
      setMessage("আপনার রিভিউ জমা হয়েছে। Supreme যাচাই করে অনুমোদন করলে এটি প্রকাশিত হবে এবং নিয়ম চালু থাকলে Eixon রিওয়ার্ড পাবেন।");
      setTitle("");
      setBody("");
      setOrderItemId("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "রিভিউ জমা দেওয়া যায়নি।");
    } finally {
      setSubmitting(false);
    }
  }

  const average = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0;

  return (
    <section aria-labelledby="review-heading" className="my-10 rounded-2xl border p-5 sm:p-8" style={{ borderColor: "var(--border)", background: "linear-gradient(145deg,var(--surface-raised),var(--bg))", color: "var(--ink)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-extrabold tracking-[.18em]" style={{ color: "var(--primary)" }}>VERIFIED CUSTOMER FEEDBACK</p>
          <h2 id="review-heading" className="text-2xl font-black">যাচাইকৃত ক্রেতাদের রিভিউ</h2>
          <p className="mt-2 text-sm leading-7" style={{ color: "var(--muted)" }}>শুধু Paid ও Delivered অর্ডারের ক্রেতারা ৭ দিনের রিটার্ন-উইন্ডো পার হওয়ার পর রিভিউ দিতে পারবেন। প্রতিটি রিভিউ প্রকাশের আগে যাচাই করা হয়।</p>
        </div>
        <div className="rounded-xl border px-4 py-3 text-right" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-2xl font-black">{reviews.length ? average.toFixed(1) : "—"} <span className="text-amber-500">★</span></p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>{reviews.length}টি অনুমোদিত রিভিউ</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{message}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
        <div className="space-y-3">
          {loading ? <p className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>রিভিউ লোড হচ্ছে…</p>
            : reviews.length ? reviews.map((review) => (
              <article key={review.review_id} className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{review.reviewer_name}</div>
                  <time className="text-xs" style={{ color: "var(--muted)" }}>{reviewDate(review.created_at)}</time>
                </div>
                <p className="mt-2 tracking-widest text-amber-500" aria-label={review.rating + " out of 5 stars"}>{"★".repeat(review.rating)}<span style={{ color: "var(--border-strong)" }}>{"★".repeat(5 - review.rating)}</span></p>
                <h3 className="mt-2 font-bold">{review.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7" style={{ color: "var(--muted)" }}>{review.body}</p>
                <span className="mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>যাচাইকৃত ক্রেতা</span>
              </article>
            )) : !loading ? <div className="rounded-xl border p-5 text-sm leading-7" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>এই পণ্যের কোনো অনুমোদিত রিভিউ এখনো নেই। পণ্যটি কিনে অভিজ্ঞতা শেয়ার করুন।</div> : null}
        </div>

        <div className="h-fit rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h3 className="text-lg font-black">আপনার অভিজ্ঞতা লিখুন</h3>
          {!authenticated ? (
            <div className="mt-3 text-sm leading-7" style={{ color: "var(--muted)" }}>
              রিভিউ দিতে গ্রাহক অ্যাকাউন্টে লগইন করুন এবং এই পণ্যটি কেনা, পেমেন্ট ও ডেলিভারি সম্পন্ন থাকতে হবে।
              <Link className="mt-3 inline-flex font-bold underline underline-offset-4" style={{ color: "var(--primary)" }} href={"/auth/customer-login?next=" + encodeURIComponent(returnTo)}>লগইন করুন</Link>
            </div>
          ) : eligibleOrders.length === 0 ? (
            <p className="mt-3 text-sm leading-7" style={{ color: "var(--muted)" }}>এই পণ্যের জন্য আপনার কোনো যোগ্য অর্ডার পাওয়া যায়নি। Delivered, Paid এবং ডেলিভারি চার্জ নিষ্পত্তি হওয়া অর্ডারের ৭ দিনের রিটার্ন-উইন্ডো পার হলে রিভিউ দেওয়া যায়।</p>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
              <label className="block text-xs font-semibold">কোন অর্ডারের পণ্য?</label>
              <select required value={orderItemId} onChange={(event) => setOrderItemId(event.target.value)} className="w-full rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
                <option value="">অর্ডার নির্বাচন করুন</option>
                {eligibleOrders.map((order) => <option key={order.order_item_id} value={order.order_item_id}>#{order.order_number} · {order.product_name} · {order.quantity}টি</option>)}
              </select>
              <label className="block text-xs font-semibold">আপনার রেটিং</label>
              <div className="flex gap-1" role="group" aria-label="রেটিং নির্বাচন">
                {[1,2,3,4,5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-pressed={rating === value} className="rounded-lg px-2 py-1 text-2xl" style={{ color: value <= rating ? "#d97706" : "var(--muted)" }}>★</button>)}
              </div>
              <label htmlFor="review-title" className="block text-xs font-semibold">শিরোনাম</label>
              <input id="review-title" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink)" }} />
              <label htmlFor="review-body" className="block text-xs font-semibold">আপনার মতামত (২০–২০০০ অক্ষর)</label>
              <textarea id="review-body" required minLength={20} maxLength={2000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} className="w-full resize-y rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink)" }} />
              <button type="submit" disabled={submitting} className="w-full rounded-full px-4 py-3 text-sm font-bold disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--bg)" }}>{submitting ? "জমা হচ্ছে…" : "রিভিউ জমা দিন"}</button>
              <p className="text-xs leading-5" style={{ color: "var(--muted)" }}>রিভিউ Supreme যাচাই না করা পর্যন্ত প্রকাশিত হবে না। অনুমোদনের পর Eixon রিওয়ার্ড চালু থাকলে পুরস্কার যোগ হবে।</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
