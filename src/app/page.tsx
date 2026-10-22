const products = [
  { id: 1, name: "Premium T-Shirt", price: 650, category: "Fashion" },
  { id: 2, name: "Everyday Backpack", price: 1250, category: "Accessories" },
  { id: 3, name: "Classic Watch", price: 1850, category: "Lifestyle" },
  { id: 4, name: "Wireless Earbuds", price: 1450, category: "Electronics" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="bg-[#101d35] px-4 py-2 text-center text-sm text-white">
        সারা বাংলাদেশে ডেলিভারি | সহজ ও নিরাপদ কেনাকাটা
      </div>

      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
          <a href="/" className="text-2xl font-bold tracking-wide text-[#101d35]">
            NEWEIX<span className="text-[#b99551]">.</span>
          </a>

          <nav className="hidden gap-6 text-sm md:flex">
            <a href="/" className="hover:text-[#b99551]">হোম</a>
            <a href="#products" className="hover:text-[#b99551]">সব পণ্য</a>
            <a href="#about" className="hover:text-[#b99551]">আমাদের সম্পর্কে</a>
            <a href="#contact" className="hover:text-[#b99551]">যোগাযোগ</a>
          </nav>

          <a
            href="/cart"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            কার্ট (0)
          </a>
        </div>
      </header>

      <section className="bg-[#f5f3ee]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#9a783b]">
              Welcome to Neweix
            </p>

            <h1 className="text-4xl font-bold leading-tight text-[#101d35] md:text-6xl">
              আপনার পছন্দের পণ্য,
              <br />
              এখন এক জায়গায়।
            </h1>

            <p className="mt-5 max-w-lg leading-7 text-slate-600">
              প্রয়োজনীয় পণ্য বেছে নিন সহজে। উপভোগ করুন সহজ কেনাকাটা,
              নির্ভরযোগ্য সেবা এবং সুবিধাজনক ডেলিভারি।
            </p>

            <a
              href="#products"
              className="mt-8 inline-block rounded-lg bg-[#101d35] px-7 py-3 font-semibold text-white transition hover:bg-[#263b60]"
            >
              কেনাকাটা শুরু করুন
            </a>
          </div>

          <div className="flex min-h-64 items-center justify-center rounded-2xl bg-[#e8e3d8] p-8 md:min-h-80">
            <div className="text-center">
              <p className="text-5xl font-bold tracking-widest text-[#101d35] md:text-7xl">
                NEWEIX
              </p>
              <p className="mt-4 text-sm tracking-[0.3em] text-[#8a6d38]">
                QUALITY · VALUE · TRUST
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="products" className="mx-auto max-w-7xl px-5 py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#9a783b]">OUR COLLECTION</p>
            <h2 className="mt-2 text-3xl font-bold text-[#101d35]">
              জনপ্রিয় পণ্য
            </h2>
          </div>
          <p className="text-sm text-slate-500">মূল্য বাংলাদেশি টাকায়</p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex aspect-square items-center justify-center bg-[#f5f3ee] p-4">
                <span className="text-center text-sm font-medium text-slate-500">
                  {product.category}
                </span>
              </div>

              <div className="p-4">
                <p className="text-xs text-slate-500">{product.category}</p>
                <h3 className="mt-2 font-semibold">{product.name}</h3>
                <p className="mt-3 font-bold text-[#101d35]">
                  ৳{product.price.toLocaleString("en-BD")}
                </p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-lg bg-[#101d35] px-3 py-2 text-sm font-semibold text-white hover:bg-[#263b60]"
                >
                  বিস্তারিত দেখুন
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="about" className="bg-[#f5f3ee] px-5 py-12 text-center">
        <h2 className="text-2xl font-bold text-[#101d35]">কেন Neweix?</h2>
        <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">
          সহজ কেনাকাটা, স্বচ্ছ মূল্য এবং গ্রাহকসেবাকে গুরুত্ব দিয়ে
          Neweix তৈরি করা হচ্ছে।
        </p>
      </section>

      <footer id="contact" className="bg-[#101d35] px-5 py-8 text-center text-white">
        <p className="text-xl font-bold">NEWEIX.</p>
        <p className="mt-3 text-sm text-slate-300">
          আপনার কেনাকাটার বিশ্বস্ত ঠিকানা।
        </p>
        <p className="mt-5 text-xs text-slate-400">
          © {new Date().getFullYear()} Neweix. All rights reserved.
        </p>
      </footer>
    </main>
  );
}