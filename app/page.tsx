const products = [
  { id: "p1", name: "প্রিমিয়াম ওয়্যারলেস ইয়ারবাড", price: 1490 },
  { id: "p2", name: "মিনিমাল ডেস্ক ল্যাম্প", price: 1890 },
  { id: "p3", name: "ডেইলি ব্যাকপ্যাক", price: 2290 },
];

function formatPrice(price: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function HomePage() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">neweix<span>.</span></a>
        <nav>
          <a href="#products">পণ্য</a>
          <a href="/track-order">অর্ডার ট্র্যাক</a>
          <a className="nav-button" href="/cart">কার্ট</a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">NEWEIX STORE · BANGLADESH</p>
        <h1>প্রতিদিনের পছন্দ,<br />
          <span>আরও সহজে।</span>
        </h1>
        <p className="hero-copy">
          আপনার প্রয়োজনীয় পণ্য বেছে নিন—সহজ ও স্বচ্ছ কেনাকাটার অভিজ্ঞতায়।
        </p>
        <a className="primary-button" href="#products">
          পণ্য দেখুন ↗
        </a>
      </section>

      <section id="products" className="products-section">
        <p className="eyebrow">বাছাই করা পণ্য</p>
        <h2>আপনার জন্য নির্বাচিত</h2>

        <div className="product-grid">
          {products.map((product, index) => (
            <article className="product-card" key={product.id}>
              <div className={`product-art art-${index + 1}`}>
                <span>0{index + 1}</span>
              </div>
              <p className="product-label">NEWEIX COLLECTION</p>
              <h3>{product.name}</h3>
              <div className="product-bottom">
                <strong>{formatPrice(product.price)}</strong>
                <a href="/cart" aria-label="কার্টে যান">＋</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <a className="brand" href="/">neweix<span>.</span></a>
        <p>স্মার্ট কেনাকাটা, সহজ অভিজ্ঞতা।</p>
        <small>© {new Date().getFullYear()} Neweix</small>
      </footer>
    </main>
  );
}