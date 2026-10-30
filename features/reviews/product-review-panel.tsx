"use client";

export default function ProductReviewPanel() {
  return (
    <section aria-labelledby="review-heading" className="my-10 rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--border)", background: "linear-gradient(145deg,var(--surface-raised),var(--bg))", color: "var(--ink)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-extrabold tracking-[.18em]" style={{ color: "var(--primary)" }}>CUSTOMER FEEDBACK</p>
          <h2 id="review-heading" className="text-2xl font-black">ক্রেতাদের মতামত</h2>
          <p className="mt-2 text-sm leading-7" style={{ color: "var(--muted)" }}>পণ্য কেনার অভিজ্ঞতা শেয়ার করার জন্য রিভিউ ব্যবস্থা প্রস্তুত করা হচ্ছে।</p>
        </div>
        <span className="rounded-full border px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--border-strong)", color: "var(--primary)" }}>শিগগিরই আসছে</span>
      </div>
      <div role="status" className="mt-6 flex gap-4 rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "var(--primary)18", color: "var(--primary)" }}>✦</span>
        <div>
          <strong className="text-sm">যাচাইকৃত ক্রেতার রিভিউ</strong>
          <p className="mt-2 text-sm leading-7" style={{ color: "var(--muted)" }}>ভুয়া রেটিং বা বানানো মতামত দেখানো হবে না। কেনাকাটা যাচাই, রিভিউ জমা এবং প্রকাশের নিরাপদ ব্যবস্থা তৈরি হলে এখানে প্রকৃত ক্রেতাদের মতামত দেখা যাবে।</p>
        </div>
      </div>
    </section>
  );
}
