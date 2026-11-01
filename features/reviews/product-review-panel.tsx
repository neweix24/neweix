"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useLanguage } from "@/components/language-provider";

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

function reviewDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium" }).format(new Date(value));
}

export default function ProductReviewPanel({ productId, returnTo }: { productId: string; returnTo: string }) {
  const { locale, t } = useLanguage();
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
      if (!response.ok || !result?.success) throw new Error(result?.error || t("reviewLoadError"));
      setReviews(Array.isArray(result.reviews) ? result.reviews as Review[] : []);
      setEligibleOrders(Array.isArray(result.eligibleOrders) ? result.eligibleOrders as EligibleOrder[] : []);
      setAuthenticated(Boolean(result.authenticated));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("reviewLoadError"));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!orderItemId) { setError(t("selectPurchasedProduct")); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, orderItemId, rating, title, body }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || t("reviewSubmitError"));
      setMessage(t("reviewPending"));
      setTitle("");
      setBody("");
      setOrderItemId("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("reviewSubmitError"));
    } finally {
      setSubmitting(false);
    }
  }

  const average = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0;

  return (
    <section aria-labelledby="review-heading" className="my-10 rounded-2xl border p-5 sm:p-8" style={{ borderColor: "var(--border)", background: "linear-gradient(145deg,var(--surface-raised),var(--bg))", color: "var(--ink)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-extrabold tracking-[.18em]" style={{ color: "var(--primary)" }}>{t("verifiedCustomerFeedback")}</p>
          <h2 id="review-heading" className="text-2xl font-black">{t("verifiedBuyerReviews")}</h2>
          <p className="mt-2 text-sm leading-7" style={{ color: "var(--muted)" }}>{t("noLoginToReadReviews")}</p>
        </div>
        <div className="rounded-xl border px-4 py-3 text-right" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-2xl font-black">{reviews.length ? average.toFixed(1) : "—"} <span className="text-amber-500">★</span></p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>{reviews.length} {t("approvedReviews")}</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{message}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
        <div className="space-y-3">
          {loading ? <p className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>{t("loadingReviews")}</p>
            : reviews.length ? reviews.map((review) => (
              <article key={review.review_id} className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{review.reviewer_name}</div>
                  <time className="text-xs" style={{ color: "var(--muted)" }}>{reviewDate(review.created_at, locale)}</time>
                </div>
                <p className="mt-2 tracking-widest text-amber-500" aria-label={review.rating + " out of 5 stars"}>{"★".repeat(review.rating)}<span style={{ color: "var(--border-strong)" }}>{"★".repeat(5 - review.rating)}</span></p>
                <h3 className="mt-2 font-bold">{review.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7" style={{ color: "var(--muted)" }}>{review.body}</p>
                <span className="mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold" style={{ borderColor: "var(--border)", color: "var(--primary)" }}>{t("verifiedBuyer")}</span>
              </article>
            )) : !loading ? <div className="rounded-xl border p-5 text-sm leading-7" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>{t("noApprovedReviews")}</div> : null}
        </div>

        <div className="h-fit rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h3 className="text-lg font-black">{t("writeYourReview")}</h3>
          {!authenticated ? (
            <div className="mt-3 text-sm leading-7" style={{ color: "var(--muted)" }}>
              {t("loginToReview")}
              <Link className="mt-3 inline-flex font-bold underline underline-offset-4" style={{ color: "var(--primary)" }} href={"/auth/customer-login?next=" + encodeURIComponent(returnTo)}>{t("loginSignup")}</Link>
            </div>
          ) : eligibleOrders.length === 0 ? (
            <p className="mt-3 text-sm leading-7" style={{ color: "var(--muted)" }}>{t("eligibleOrders")}</p>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
              <label className="block text-xs font-semibold">{t("selectOrder")}</label>
              <select required value={orderItemId} onChange={(event) => setOrderItemId(event.target.value)} className="w-full rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
                <option value="">{t("chooseOrder")}</option>
                {eligibleOrders.map((order) => <option key={order.order_item_id} value={order.order_item_id}>#{order.order_number} · {order.product_name} · {order.quantity} {t("itemCount")}</option>)}
              </select>
              <label className="block text-xs font-semibold">{t("rating")}</label>
              <div className="flex gap-1" role="group" aria-label={t("chooseRating")}>
                {[1,2,3,4,5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-pressed={rating === value} className="rounded-lg px-2 py-1 text-2xl" style={{ color: value <= rating ? "#d97706" : "var(--muted)" }} aria-label={`${value} stars`}><Icon name="star" size={21} /></button>)}
              </div>
              <label htmlFor="review-title" className="block text-xs font-semibold">{t("reviewTitle")}</label>
              <input id="review-title" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink)" }} />
              <label htmlFor="review-body" className="block text-xs font-semibold">{t("reviewBody")}</label>
              <textarea id="review-body" required minLength={20} maxLength={2000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} className="w-full resize-y rounded-lg border bg-transparent p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink)" }} />
              <button type="submit" disabled={submitting} className="w-full rounded-full px-4 py-3 text-sm font-bold disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--bg)" }}><><Icon name={submitting ? "refresh" : "check"} size={17} /> {submitting ? t("submittingReview") : t("submitReview")}</></button>
              <p className="text-xs leading-5" style={{ color: "var(--muted)" }}>{t("moderationNote")}</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
