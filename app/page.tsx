"use client";

import { useEffect, useMemo, useState } from "react";

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
    account: "আমার অ্যাকাউন্ট",
    search: "পণ্য খুঁজুন",
    searchPlaceholder: "পণ্যের নাম লিখুন...",
    clearSearch: "মুছুন",
    noSearchResults: "এই নামে কোনো পণ্য পাওয়া যায়নি।",
    eyebrow: "NEWEIX STORE · BANGLADESH",
    heroFirst: "আপনার কেনাকাটা,",
    heroSecond: "আরও স্মার্ট।",
    heroCopy:
      "আপনার পছন্দের পণ্য খুঁজুন, সহজে অর্ডার করুন এবং উপভোগ করুন নতুন কেনাকাটার অভিজ্ঞতা।",
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
    account: "My Account",
    search: "Search products",
    searchPlaceholder: "Enter a product name...",
    clearSearch: "Clear",
    noSearchResults: "No products matched your search.",
    eyebrow: "NEWEIX STORE · BANGLADESH",
    heroFirst: "Shopping made",
    heroSecond: "smarter.",
    heroCopy:
      "Discover products you love, order with ease, and enjoy a better shopping experience.",
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
  const [searchQuery, setSearchQuery] = useState("");

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

    void initialLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    if (!query) return products;

    return products.filter((product) => {
      const searchableText = [
        product.name,
        product.slug,
        product.description ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase();

      return searchableText.includes(query);
    });
  }, [products, searchQuery]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    document.getElementById("products")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <main lang={language}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="NEWEIX Home">
          NEWEIX<span>.</span>
        </a>

        <nav
          aria-label={
            language === "bn" ? "প্রধান নেভিগেশন" : "Main navigation"
          }
        >
          <a href="#products">{t.shop}</a>
          <a href="/track-order">{t.track}</a>
          <a href="/account">{t.account}</a>
          <a className="nav-button" href="/cart">
            {t.cart} ↗
          </a>

          <button
            type="button"
            className="language-button"
            onClick={() => {
              setLanguage(language === "bn" ? "en" : "bn");
              setNotice("");
            }}
            aria-label={
              language === "bn" ? "Switch to English" : "বাংলায় পরিবর্তন করুন"
            }
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

        <div className="hero-points">
          {[
            language === "bn" ? "✦ সহজ কেনাকাটা" : "✦ Easy Shopping",
            language === "bn" ? "✓ স্বচ্ছ মূল্য" : "✓ Clear Pricing",
            language === "bn" ? "↗ দ্রুত অর্ডার" : "↗ Simple Ordering",
          ].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section id="products" className="products-section">
        <p className="eyebrow">{t.featured}</p>
        <h2>{t.heading}</h2>
        <p>{t.subtitle}</p>

        <form className="product-search" onSubmit={handleSearchSubmit}>
          <label className="sr-only" htmlFor="product-search-input">
            {t.search}
          </label>

          <span aria-hidden="true">⌕</span>

          <input
            id="product-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
            autoComplete="off"
          />

          {searchQuery && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setSearchQuery("")}
            >
              {t.clearSearch}
            </button>
          )}

          <button className="search-button" type="submit">
            {t.search}
          </button>
        </form>

        {notice && (
          <p className="notice" role="status" aria-live="polite">
            {notice}{" "}
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label={
                language === "bn" ? "বার্তা বন্ধ করুন" : "Dismiss message"
              }
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

        {!loading &&
          !error &&
          products.length > 0 &&
          filteredProducts.length === 0 && (
            <p role="status">{t.noSearchResults}</p>
          )}

        {!loading && !error && filteredProducts.length > 0 && (
          <div className="product-grid">
            {filteredProducts.map((product, index) => (
              <article className="product-card" key={product.id}>
                <a
                  href={`/products/${encodeURIComponent(product.slug)}`}
                  aria-label={
                    language === "bn"
                      ? `${product.name} বিস্তারিত দেখুন`
                      : `View ${product.name} details`
                  }
                  className="product-link"
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

                {product.description && <p>{product.description}</p>}

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
                  className={
                    product.stock > 0 ? "stock-status" : "stock-status out"
                  }
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

        <nav aria-label={language === "bn" ? "ফুটার লিংক" : "Footer links"}>
          <a href="/account">{t.account}</a>
          <a href="/track-order">{t.track}</a>
          <a href="/cart">{t.cart}</a>
          <a href="/account/theme">
            {language === "bn" ? "নিজের থিম সাজাও" : "Customize theme"}
          </a>
        </nav>

        <small>
          © {new Date().getFullYear()} NEWEIX. {t.rights}
        </small>
      </footer>

      <style jsx>{`
        .language-button {
          min-height: 38px;
          padding: 7px 12px;
          color: var(--primary);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 999px;
          font-weight: 800;
          cursor: pointer;
        }

        .hero-points {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 38px;
        }

        .hero-points span {
          padding: 8px 13px;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid var(--border);
          border-radius: 999px;
          font-size: 12px;
        }

        .product-search {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          max-width: 680px;
          margin: 24px 0;
          padding: 8px 10px 8px 16px;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: var(--surface);
          color: var(--ink);
        }

        .product-search > span {
          font-size: 24px;
          line-height: 1;
        }

        .product-search input {
          flex: 1;
          min-width: 0;
          min-height: 42px;
          border: 0;
          outline: none;
          background: transparent;
          color: inherit;
          font: inherit;
        }

        .product-search input:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }

        .search-button,
        .clear-search {
          min-height: 40px;
          padding: 8px 13px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--primary);
          color: var(--bg);
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }

        .clear-search {
          background: transparent;
          color: inherit;
        }

        .notice {
          padding: 12px 16px;
          color: var(--primary);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
        }

        .notice button {
          margin-left: 8px;
          padding: 2px 8px;
          color: inherit;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
        }

        .product-link {
          display: block;
          color: inherit;
          text-decoration: none;
        }

        .product-bottom button {
          min-width: 42px;
          min-height: 42px;
          cursor: pointer;
        }

        .product-bottom button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .stock-status {
          margin-bottom: 0;
          color: var(--primary);
          font-size: 12px;
        }

        .stock-status.out {
          color: var(--danger);
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        footer nav {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
        }

        footer nav a {
          color: inherit;
          text-decoration: none;
        }

        footer nav a:hover {
          text-decoration: underline;
        }

        @media (max-width: 760px) {
          .topbar {
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 14px;
          }

          .topbar nav {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            width: 100%;
          }

          .product-search {
            flex-wrap: wrap;
          }

          .product-search input {
            flex-basis: 70%;
          }

          .search-button {
            flex: 1;
          }
        }

        @media (max-width: 420px) {
          .product-search {
            padding: 8px;
          }

          .product-search > span {
            display: none;
          }

          .product-search input {
            flex-basis: 100%;
          }
        }
      `}</style>
    </main>
  );
}