"use client";

import { useCallback, useEffect, useState } from "react";

type Review = {
  review_id: string;
  product_id: string;
  product_name: string;
  order_number: string;
  reviewer_name: string;
  reviewer_user_id: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
};

function date(value: string) {
  return new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ProductReviewModeration() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/supreme/reviews", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "রিভিউ তালিকা লোড করা যায়নি।");
      setReviews(Array.isArray(result.reviews) ? result.reviews as Review[] : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "রিভিউ লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(reviewId: string, decision: "approve" | "reject") {
    if (busy) return;
    setBusy(reviewId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/supreme/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, decision, note: notes[reviewId] ?? "" }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "সিদ্ধান্ত সংরক্ষণ করা যায়নি।");
      setMessage(decision === "approve"
        ? "রিভিউ অনুমোদিত হয়েছে। " + (result.result?.reward_awarded ?? 0) + " Eixon রিওয়ার্ড দেওয়া হয়েছে।"
        : "রিভিউ প্রত্যাখ্যান করা হয়েছে।");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "সিদ্ধান্ত সংরক্ষণ করা যায়নি।");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em]" style={{ color: "var(--primary)" }}>EixVerse · Eixon Rewards</p>
          <h1 className="mt-2 text-3xl font-black">Verified Review Moderation</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>শুধু Supreme অনুমোদন করতে পারবেন। অনুমোদনের সঙ্গে Verified Review Eixon reward একই ডেটাবেস ট্রানজ্যাকশনে যোগ হবে।</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--border)" }}>রিফ্রেশ</button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700">{message}</p>}
      {loading ? <div className="rounded-2xl border p-8 text-sm" style={{ borderColor: "var(--border)" }}>রিভিউ লোড হচ্ছে…</div>
        : reviews.length === 0 ? <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><h2 className="text-xl font-bold">Pending রিভিউ নেই</h2><p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>নতুন যাচাইকৃত ক্রেতার রিভিউ জমা হলে এখানে দেখা যাবে।</p></div>
        : <div className="space-y-4">{reviews.map((review) => (
          <article key={review.review_id} className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex flex-wrap justify-between gap-3">
              <div><p className="text-xs font-bold" style={{ color: "var(--primary)" }}>{review.product_name}</p><h2 className="mt-1 text-lg font-bold">{review.title}</h2></div>
              <p className="text-amber-500">{"★".repeat(review.rating)}<span style={{ color: "var(--border-strong)" }}>{"★".repeat(5-review.rating)}</span></p>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7" style={{ color: "var(--muted)" }}>{review.body}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              <span>ক্রেতা: {review.reviewer_name}</span><span>Order: {review.order_number}</span><span>{date(review.created_at)}</span>
            </div>
            <label className="mt-4 block text-xs font-semibold">মডারেশন নোট (ঐচ্ছিক)</label>
            <textarea maxLength={500} rows={2} value={notes[review.review_id] ?? ""} onChange={(event) => setNotes((old) => ({ ...old, [review.review_id]: event.target.value }))} className="mt-1 w-full rounded-xl border bg-transparent p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink)" }} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => void decide(review.review_id, "approve")} className="rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--bg)" }}>{busy === review.review_id ? "প্রক্রিয়াধীন…" : "অনুমোদন ও Eixon প্রদান"}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void decide(review.review_id, "reject")} className="rounded-full border px-5 py-2.5 text-sm font-bold disabled:opacity-50" style={{ borderColor: "var(--border)" }}>প্রত্যাখ্যান</button>
            </div>
          </article>
        ))}</div>}
    </section>
  );
}
