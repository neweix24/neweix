"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  image_urls: string[] | null;
  stock: number;
  is_featured?: boolean;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        const response = await fetch("/api/products");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "পণ্য লোড করা যায়নি");
        }

        if (!cancelled) {
          setProducts(result.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("পণ্য লোড করা যায়নি। অনুগ্রহ করে পরে আবার চেষ্টা করুন।");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">
          neweix<span>.</span>
        </a>
        <nav>
          <a href="#products">পণ্য</a>
          <a href="/track-order">অর্ডার ট্র্যাক</a>
          <a className="nav-button" href="/cart">কার্ট</a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">NEWEIX STORE · BANGLADESH</p>
        <h1>
          প্রতিদিনের পছন্দ,
          <br />
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

        {loading && <p>পণ্য লোড হচ্ছে...</p>}

        {!loading && error && (
          <p role="alert">{error}</p>
        )}

        {!loading && !error && products.length === 0 && (
          <p>এখনো কোনো সক্রিয় পণ্য নেই। শিগগিরই নতুন পণ্য আসছে।</p>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="product-grid">
            {products.map((product, index) => (
              <article className="product-card" key={product.id}>
                {product.image_urls?.[0] ? (
                  <div className="product-art">
                    <img
                      src={product.image_urls[0]}
                      alt={product.name}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                ) : (
                  <div className={`product-art art-${(index % 3) + 1}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                )}

                <p className="product-label">NEWEIX COLLECTION</p>
                <h3>{product.name}</h3>

                {product.description && (
                  <p>{product.description}</p>
                )}

                <div className="product-bottom">
                  <strong>{formatPrice(Number(product.price))}</strong>
                  <a href="/cart" aria-label={`${product.name} কিনুন`}>
                    ＋
                  </a>
                </div>

                <p>
                  {product.stock > 0
                    ? "স্টকে আছে"
                    : "স্টক শেষ"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <a className="brand" href="/">
          neweix<span>.</span>
        </a>
        <p>স্মার্ট কেনাকাটা, সহজ অভিজ্ঞতা।</p>
        <small>© {new Date().getFullYear()} Neweix</small>
      </footer>
    </main>
  );
}