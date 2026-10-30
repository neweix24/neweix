"use client";

export default function ProductReviewPanel() {
  return (
    <section aria-labelledby="review-heading" className="my-10 rounded-2xl border p-6 sm:p-8" style={{ borderColor: "#29372d", background: "linear-gradient(145deg,#152019,#0d130f)", color: "#f4f7f2" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-extrabold tracking-[.18em]" style={{ color: "#c4f36b" }}>CUSTOMER FEEDBACK</p>
          <h2 id="review-heading" className="text-2xl font-black">ক্রেতাদের মতামত</h2>
          <p className="mt-2 text-sm leading-7" style={{ color: "#aab8ad" }}>পণ্য কেনার অভিজ্ঞতা শেয়ার করার জন্য রিভিউ ব্যবস্থা প্রস্তুত করা হচ্ছে।</p>
        </div>
        <span className="rounded-full border px-3 py-2 text-xs font-bold" style={{ borderColor: "#52613f", color: "#d2f78e" }}>শিগগিরই আসছে</span>
      </div>
      <div role="status" className="mt-6 flex gap-4 rounded-xl border p-4 sm:p-5" style={{ borderColor: "#344535", background: "#0e1711" }}>
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "#c4f36b18", color: "#c4f36b" }}>✦</span>
        <div>
          <strong className="text-sm">যাচাইকৃত ক্রেতার রিভিউ</strong>
          <p className="mt-2 text-sm leading-7" style={{ color: "#aab8ad" }}>ভুয়া রেটিং বা বানানো মতামত দেখানো হবে না। কেনাকাটা যাচাই, রিভিউ জমা এবং প্রকাশের নিরাপদ ব্যবস্থা তৈরি হলে এখানে প্রকৃত ক্রেতাদের মতামত দেখা যাবে।</p>
        </div>
      </div>
    </section>
  );
}
