"use client";

import { useEffect, useState } from "react";

type Language = "bn" | "en";

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

const TEXT = {
  bn: {
    shop: "পণ্য",
    track: "অর্ডার ট্র্যাক",
    cart: "কার্ট",
    eyebrow: "NEWEIX STORE · BANGLADESH",
    heroFirst: "আপনার কেনাকাটা,",
    heroSecond: "আরও স্মার্ট।",
    heroCopy: "আপনার পছন্দের পণ্য খুঁজুন, সহজে অর্ডার করুন এবং উপভোগ করুন নতুন কেনাকাটার অভিজ্ঞতা।",
    shopNow: "পণ্য দেখুন",
    collection: "NEWEIX COLLECTION",
    featured: "FEATURED PRODUCTS",
    heading: "আপনার পছন্দের পণ্য",
    subtitle: "প্রতিদিনের প্রয়োজনের জন্য বাছাই করা পণ্য।",
    loading: "পণ্য লোড হচ্ছে...",
    error: "পণ্য লোড করা যায়নি। পরে আবার চেষ্টা করুন।",
    retry: "আবার চেষ্টা করুন",
    empty: "এই মুহূর্তে কোনো সক্রিয় পণ্য নেই।",
    inStock: "স্টকে আছে",
    outOfStock: "স্টক শেষ",
    add: "কার্টে যোগ করুন",
    added: "পণ্য কার্টে যোগ করা হয়েছে।",
    unavailable: "দুঃখিত, পণ্যটি স্টকে নেই।",
    maxStock: "স্টকে থাকা সর্বোচ্চ পরিমাণ ইতিমধ্যে কার্টে আছে।",
    cartError: "কার্টে পণ্য যোগ করা যায়নি। আবার চেষ্টা করুন।",
    footer: "স্মার্ট কেনাকাটা, সহজ অভিজ্ঞতা।",
    rights: "সর্বস্বত্ব সংরক্ষিত।",
  },
  en: {
    shop: "Shop",
    track: "Track Order",
    cart: "Cart",
    eyebrow: "NEWEIX STORE · BANGLADESH",
    heroFirst: "Shopping made",
    heroSecond: "smarter.",
    heroCopy: "Discover products you love, order with ease, and enjoy a better shopping experience.",
    shopNow: "Explore Products",
    collection: "NEWEIX COLLECTION",
    featured: "FEATURED PRODUCTS",
    heading: "Picked for You",
    subtitle: "Thoughtfully selected products for everyday needs.",
    loading: "Loading products...",
    error: "Couldn't load products. Please try again.",
    retry: "Try Again",
    empty: "There are no active products right now.",
    inStock: "In stock",
    outOfStock: "Out of stock",
    add: "Add to cart",
    added: "Product added to your cart.",
    unavailable: "Sorry, this product is out of stock.",
    maxStock: "You already have the maximum available stock in your cart.",
    cartError: "Couldn't add the product. Please try again.",
    footer: "Smart shopping. A simpler experience.",
    rights: "All rights reserved.",
  },
} as const;

function formatPrice(price: number, language: Language) {
  return new Intl.NumberFormat(language === "bn" ? "bn-BD" : "en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

function addToCart(
  product: Product,
  language: Language,
  setNotice: (message: string) => void
) {
  const t = TEXT[language];

  if (product.stock < 1) {
    setNotice(t.unavailable);
    return;
  }

  try {
    const saved = localStorage.getItem("neweix_cart");
    const parsed: unknown = saved ? JSON.parse(saved) : [];

    if (!Array.isArray(parsed)) {
      setNotice(t.cartError);
      return;
    }

    const cart: { product_id: string; quantity: number }[] = parsed;
    const existing = cart.find(
      (item) => item.product_id === product.id
    );

    if (existing) {
      if (existing.quantity >= product.stock) {
        setNotice(t.maxStock);
        return;
      }

      existing.quantity += 1;
    } else {
      cart.push({
        product_id: product.id,
        quantity: 1,
      });
    }

    localStorage.setItem("neweix_cart", JSON.stringify(cart));
    setNotice(t.added);
  } catch {
    setNotice(t.cartError);
  }
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("bn");
  const [notice, setNotice] = useState("");

  const t = TEXT[language];

  async function loadProducts() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/products", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Products request failed");
      }

      const result = await response.json();
      setProducts(Array.isArray(result.data) ? result.data : []);
    } catch {
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        const response = await fetch("/api/products", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Products request failed");
        }

        const result = await response.json();

        if (!cancelled) {
          setProducts(Array.isArray(result.data) ? result.data : []);
        }
      } catch {
        if (!cancelled) {
          setError(TEXT.bn.error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main lang={language}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="NEWEIX Home">
          NEWEIX<span>.</span>
        </a>

        <nav aria-label={language === "bn" ? "প্রধান নেভিগেশন" : "Main navigation"}>
          <a href="#products">{t.shop}</a>
          <a href="/track-order">{t.track}</a>
          <a className="nav-button" href="/cart">
            {t.cart} ↗
          </a>
          <button
            type="button"
            onClick={() => {
              setLanguage(language === "bn" ? "en" : "bn");
              setNotice("");
            }}
            aria-label={language === "bn" ? "Switch to English" : "বাংলায় পরিবর্তন করুন"}
            style={{
              minHeight: 38,
              padding: "7px 12px",
              color: "var(--primary)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              fontWeight: 800,
            }}
          >
            {language === "bn" ? "EN" : "বাংলা"}
          </button>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">{t.eyebrow}</p>

        <h1>
          {t.heroFirst}
          <br />
          <span>{t.heroSecond}</span>
        </h1>

        <p className="hero-copy">{t.heroCopy}</p>

        <a className="primary-button" href="#products">
          {t.shopNow} ↗
        </a>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 38,
          }}
        >
          {[
            language === "bn" ? "✦ সহজ কেনাকাটা" : "✦ Easy Shopping",
            language === "bn" ? "✓ স্বচ্ছ মূল্য" : "✓ Clear Pricing",
            language === "bn" ? "↗ দ্রুত অর্ডার" : "↗ Simple Ordering",
          ].map((item) => (
            <span
              key={item}
              style={{
                padding: "8px 13px",
                color: "var(--muted)",
                background: "rgba(255,255,255,0.035)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                fontSize: 12,
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <section id="products" className="products-section">
        <p className="eyebrow">{t.featured}</p>
        <h2>{t.heading}</h2>
        <p>{t.subtitle}</p>

        {notice && (
          <p
            role="status"
            aria-live="polite"
            style={{
              padding: "12px 16px",
              color: "var(--primary)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            {notice}
            {" "}
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label={language === "bn" ? "বার্তা বন্ধ করুন" : "Dismiss message"}
              style={{
                marginLeft: 8,
                padding: "2px 8px",
                color: "var(--ink)",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              ×
            </button>
          </p>
        )}

        {loading && <p role="status">{t.loading}</p>}

        {!loading && error && (
          <div role="alert">
            <p>{language === "bn" ? error : TEXT.en.error}</p>
            <button
              className="primary-button"
              type="button"
              onClick={loadProducts}
            >
              {t.retry}
            </button>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <p>{t.empty}</p>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="product-grid">
            {products.map((product, index) => (
              <article className="product-card" key={product.id}>
                <a
                  href={`/products/${encodeURIComponent(product.slug)}`}
                  aria-label={
                    language === "bn"
                      ? `${product.name} বিস্তারিত দেখুন`
                      : `View ${product.name} details`
                  }
                  style={{ display: "block" }}
                >
                  <div className={`product-art art-${(index % 3) + 1}`}>
                    {product.image_urls?.[0] ? (
                      <img
                        src={product.image_urls[0]}
                        alt={product.name}
                        loading="lazy"
                      />
                    ) : (
                      <span aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    )}
                  </div>

                  <p className="product-label">{t.collection}</p>
                  <h3>{product.name}</h3>
                </a>

                {product.description && (
                  <p>{product.description}</p>
                )}

                <div className="product-bottom">
                  <strong>
                    {formatPrice(Number(product.price), language)}
                  </strong>

                  <button
                    type="button"
                    disabled={product.stock < 1}
                    onClick={() => addToCart(product, language, setNotice)}
                    aria-label={`${t.add}: ${product.name}`}
                    title={t.add}
                  >
                    +
                  </button>
                </div>

                <p
                  style={{
                    marginBottom: 0,
                    color: product.stock > 0 ? "var(--primary)" : "var(--danger)",
                    fontSize: 12,
                  }}
                >
                  {product.stock > 0 ? t.inStock : t.outOfStock}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <div>
          <a className="brand" href="/">
            NEWEIX<span>.</span>
          </a>
          <p>{t.footer}</p>
        </div>

        <div>
          <a href="/track-order">{t.track}</a>
          {" · "}
          <a href="/cart">{t.cart}</a>
        </div>

        <small>
          © {new Date().getFullYear()} NEWEIX. {t.rights}
        </small>
      </footer>
    </main>
  );
}