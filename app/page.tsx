const products = [
  { id: 1, name: "Premium T-Shirt", price: 650, category: "Fashion" },
  { id: 2, name: "Classic Watch", price: 1850, category: "Lifestyle" },
  { id: 3, name: "Wireless Earbuds", price: 1450, category: "Electronics" },
  { id: 4, name: "Everyday Backpack", price: 1250, category: "Accessories" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="bg-[#101d35] px-4 py-2 text-center text-sm text-white">
        সারা বাংলাদেশে ডেলিভারি সুবিধা
      </div>

      <header className="flex items-center justify-between border-b px-5 py-5">
        <a href="/" className="text-2xl font-bold text-[#101d35]">
          NEWEIX<span className="text-[#b99551]">.</span>
        </a>
        <a href="/cart" className="rounded-lg border px-4 py-2 text-sm">
          কার্ট
        </a>
      </header>

      <section className="bg-[#f5f3ee] px-5 py-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 text-sm font-semibold tracking-widest text-[#9a783b]">
            WELCOME TO NEWEIX
          </p>

          <h1 className="max-w-2xl text-4xl font-bold leading-tight text-[#101d35] md:text-6xl">
            আপনার পছন্দের পণ্য,
            <br />
            এখন এক জায়গায়।
          </h1>

          <p className="mt-5 max-w-xl leading-7 text-slate-600">
            সহজ কেনাকাটা, মানসম্মত পণ্য এবং সুবিধাজনক ডেলিভারি।
          </p>

          <a
            href="#products"
            className="mt-8 inline-block rounded-lg bg-[#101d35] px-7 py-3 font-semibold text-white"
          >
            কেনাকাটা শুরু করুন
          </a>
        </div>
      </section>

      <section id="products" className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="mb-8 text-3xl font-bold text-[#101d35]">
          জনপ্রিয় পণ্য
        </h2>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-xl border border-slate-200"
            >
              <div className="flex aspect-square items-center justify-center bg-[#f5f3ee] p-3">
                <span className="text-sm text-slate-500">
                  {product.category}
                </span>
              </div>

              <div className="p-4">
                <h3 className="font-semibold">{product.name}</h3>
                <p className="mt-2 font-bold text-[#101d35]">
                  ৳{product.price.toLocaleString("en-BD")}
                </p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-lg bg-[#101d35] px-3 py-2 text-sm text-white"
                >
                  বিস্তারিত দেখুন
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="bg-[#101d35] px-5 py-8 text-center text-white">
        <p className="text-xl font-bold">NEWEIX.</p>
        <p className="mt-3 text-sm text-slate-300">
          আপনার কেনাকাটার বিশ্বস্ত ঠিকানা।
        </p>
        <p className="mt-5 text-xs text-slate-400">
          © {new Date().getFullYear()} Neweix
        </p>
      </footer>
    </main>
  );
}