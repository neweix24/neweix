"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Language = "bn" | "en";

type Product = {
id: string;
name: string;
slug: string;
description: string | null;
price: number;
compare_at_price?: number | null;
image_urls: string[] | null;
stock: number;
is_featured?: boolean;
};

const TEXT = {
bn: {
shop: "পণ্য দেখুন",
track: "অর্ডার ট্র্যাক করুন",
account: "আমার অ্যাকাউন্ট",
cart: "কার্ট",
language: "ভাষা পরিবর্তন",
search: "পণ্য খুঁজুন",
placeholder: "আপনার পছন্দের পণ্য খুঁজুন...",
heroTag: "PREMIUM SHOPPING EXPERIENCE",
heroTitle: "পছন্দের কেনাকাটা।",
heroAccent: "নতুন অভিজ্ঞতা।",
heroCopy: "আবিষ্কার করুন আপনার পছন্দের পণ্য—সহজ, স্মার্ট ও নির্ভরযোগ্য কেনাকাটার জন্য।",
explore: "পণ্য আবিষ্কার করুন",
collection: "NEWEIX COLLECTION",
featured: "বিশেষভাবে নির্বাচিত",
heading: "আপনার পছন্দের পণ্য",
subtitle: "আপনার দৈনন্দিন প্রয়োজনের জন্য বাছাই করা পণ্য।",
loading: "পণ্য লোড হচ্ছে...",
error: "পণ্য লোড করা যায়নি। আবার চেষ্টা করুন।",
retry: "আবার চেষ্টা করুন",
empty: "এই মুহূর্তে কোনো সক্রিয় পণ্য নেই।",
noResults: "আপনার সার্চের সঙ্গে মেলে এমন পণ্য পাওয়া যায়নি।",
inStock: "স্টকে আছে",
outOfStock: "স্টক শেষ",
add: "কার্টে যোগ করুন",
added: "কার্টে যোগ করা হয়েছে",
unavailable: "পণ্যটি বর্তমানে স্টকে নেই।",
maxStock: "স্টকে থাকা সর্বোচ্চ পরিমাণ কার্টে আছে।",
cartError: "কার্ট আপডেট করা যায়নি। আবার চেষ্টা করুন।",
footer: "স্মার্ট কেনাকাটা, আরও সুন্দর অভিজ্ঞতা।",
rights: "সর্বস্বত্ব সংরক্ষিত।",
},
en: {
shop: "Explore products",
track: "Track your order",
account: "My account",
cart: "Cart",
language: "Change language",
search: "Search products",
placeholder: "Find something you love...",
heroTag: "PREMIUM SHOPPING EXPERIENCE",
heroTitle: "Discover better.",
heroAccent: "Shop smarter.",
heroCopy: "Discover products you love through a simpler, smarter shopping experience.",
explore: "Explore collection",
collection: "NEWEIX COLLECTION",
featured: "CURATED FOR YOU",
heading: "Discover your favourites",
subtitle: "Thoughtfully selected products for everyday life.",
loading: "Loading products...",
error: "Products could not be loaded. Please try again.",
retry: "Try again",
empty: "There are no active products right now.",
noResults: "No products matched your search.",
inStock: "In stock",
outOfStock: "Out of stock",
add: "Add to cart",
added: "Added to cart",
unavailable: "This product is out of stock.",
maxStock: "You already have the maximum available stock in your cart.",
cartError: "Could not update your cart. Please try again.",
footer: "Smarter shopping. A better experience.",
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

const cart = parsed as { product_id: string; quantity: number }[];
const existing = cart.find((item) => item.product_id === product.id);

if (existing) {
  if (
    !Number.isSafeInteger(existing.quantity) ||
    existing.quantity < 1
  ) {
    setNotice(t.cartError);
    return;
  }

  if (existing.quantity >= product.stock) {
    setNotice(t.maxStock);
    return;
  }

  existing.quantity += 1;
} else {
  cart.push({ product_id: product.id, quantity: 1 });
}

localStorage.setItem("neweix_cart", JSON.stringify(cart));
setNotice(t.added);

} catch {
setNotice(t.cartError);
}
}

function Icon({
name,
size = 21,
}: {
name: "user" | "search" | "cart" | "package" | "arrow" | "globe" | "close" | "sparkle";
size?: number;
}) {
const common = {
width: size,
height: size,
viewBox: "0 0 24 24",
fill: "none",
stroke: "currentColor",
strokeWidth: 1.7,
strokeLinecap: "round" as const,
strokeLinejoin: "round" as const,
"aria-hidden": true as const,
};

switch (name) {
case "user":
return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
case "search":
return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
case "cart":
return <svg {...common}><path d="M3 4h2l2.2 10.3a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 1.9-1.5L21 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>;
case "package":
return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></svg>;
case "arrow":
return <svg {...common}><path d="M5 12h14M13 5l7 7-7 7" /></svg>;
case "globe":
return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>;
case "close":
return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
case "sparkle":
return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 15l1.1 2.9L23 19l-2.9 1.1L19 23l-1.1-2.9L15 19l2.9-1.1L19 15Z" /></svg>;
}
}

export default function HomePage() {
const [products, setProducts] = useState<Product[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(false);
const [language, setLanguage] = useState<Language>("bn");
const [notice, setNotice] = useState("");
const [searchQuery, setSearchQuery] = useState("");

const t = TEXT[language];

async function loadProducts() {
setLoading(true);
setError(false);

try {
  const response = await fetch("/api/products", { cache: "no-store" });
  if (!response.ok) throw new Error("Product request failed");

  const result = await response.json();
  if (!Array.isArray(result.data)) throw new Error("Invalid product response");

  setProducts(result.data);
} catch {
  setError(true);
} finally {
  setLoading(false);
}

}

useEffect(() => {
let cancelled = false;

async function initialLoad() {
  try {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) throw new Error("Product request failed");

    const result = await response.json();
    if (!Array.isArray(result.data)) throw new Error("Invalid product response");

    if (!cancelled) setProducts(result.data);
  } catch {
    if (!cancelled) setError(true);
  } finally {
    if (!cancelled) setLoading(false);
  }
}

void initialLoad();
return () => { cancelled = true; };

}, []);

const filteredProducts = useMemo(() => {
const query = searchQuery.trim().toLocaleLowerCase();
if (!query) return products;

return products.filter((product) =>
  [product.name, product.slug, product.description ?? ""]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query)
);

}, [products, searchQuery]);

return (
<main className="premium-home" lang={language}>
<header className="premium-header">
<Link
href="/account"
className="icon-button profile-button"
aria-label={t.account}
title={t.account}
>
<Icon name="user" />
</Link>

    <a href="#products" className="wordmark" aria-label="NEWEIX collection">
      <span className="wordmark-mark">N</span>
      <span className="wordmark-text">NEWEIX</span>
    </a>

    <nav className="header-actions" aria-label="Main navigation">
      <Link className="icon-button desktop-action" href="/track-order" aria-label={t.track} title={t.track}>
        <Icon name="package" />
      </Link>
      <Link className="icon-button cart-button" href="/cart" aria-label={t.cart} title={t.cart}>
        <Icon name="cart" />
      </Link>
      <button
        className="icon-button"
        type="button"
        onClick={() => { setLanguage(language === "bn" ? "en" : "bn"); setNotice(""); }}
        aria-label={t.language}
        title={t.language}
      >
        <Icon name="globe" />
      </button>
    </nav>
  </header>

  <section className="premium-hero">
    <div className="hero-orb hero-orb-one" />
    <div className="hero-orb hero-orb-two" />
    <div className="hero-content">
      <p className="premium-eyebrow"><Icon name="sparkle" size={15} /> {t.heroTag}</p>
      <h1>{t.heroTitle}<br /><span>{t.heroAccent}</span></h1>
      <p className="hero-description">{t.heroCopy}</p>
      <a href="#products" className="hero-cta">
        {t.explore}<Icon name="arrow" size={18} />
      </a>
      <div className="hero-caption">
        <span className="caption-line" />
        <span>{t.collection}</span>
      </div>
    </div>
    <div className="hero-side-note" aria-hidden="true">N / 01</div>
  </section>

  <section id="products" className="premium-products">
    <div className="section-topline">
      <div>
        <p className="section-eyebrow">{t.featured}</p>
        <h2>{t.heading}</h2>
        <p className="section-subtitle">{t.subtitle}</p>
      </div>
      <a href="#products" className="round-arrow" aria-label={t.shop} title={t.shop}>
        <Icon name="arrow" />
      </a>
    </div>

    <form className="premium-search" onSubmit={(event) => {
      event.preventDefault();
      document.getElementById("products-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }}>
      <Icon name="search" size={20} />
      <label className="sr-only" htmlFor="premium-search-input">{t.search}</label>
      <input
        id="premium-search-input"
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder={t.placeholder}
        autoComplete="off"
      />
      {searchQuery && (
        <button type="button" className="clear-search" onClick={() => setSearchQuery("")} aria-label={language === "bn" ? "সার্চ মুছুন" : "Clear search"}>
          <Icon name="close" size={17} />
        </button>
      )}
      <button type="submit" className="search-icon-button" aria-label={t.search} title={t.search}>
        <Icon name="arrow" />
      </button>
    </form>

    {notice && (
      <div className="premium-notice" role="status" aria-live="polite">
        <span>{notice}</span>
        <button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice"><Icon name="close" size={17} /></button>
      </div>
    )}

    {loading && <p className="state-message" role="status">{t.loading}</p>}

    {!loading && error && (
      <div className="state-panel" role="alert">
        <p>{t.error}</p>
        <button className="retry-button" type="button" onClick={() => void loadProducts()}>{t.retry}</button>
      </div>
    )}

    {!loading && !error && products.length === 0 && <p className="state-message">{t.empty}</p>}

    {!loading && !error && products.length > 0 && filteredProducts.length === 0 && (
      <p className="state-message">{t.noResults}</p>
    )}

    {!loading && !error && filteredProducts.length > 0 && (
      <div id="products-grid" className="premium-grid">
        {filteredProducts.map((product, index) => (
          <article className="premium-card" key={product.id}>
            <Link
              href={`/products/${encodeURIComponent(product.slug)}`}
              className="product-image-link"
              aria-label={language === "bn" ? `${product.name} বিস্তারিত` : `View ${product.name}`}
            >
              <div className={`premium-image image-tone-${index % 4}`}>
                {product.image_urls?.[0] ? (
                  <Image src={product.image_urls[0]} alt={product.name} width={800} height={800} loading="lazy" unoptimized />
                ) : (
                  <div className="image-placeholder"><Icon name="sparkle" size={32} /><span>NEWEIX</span></div>
                )}
                {product.is_featured && <span className="featured-badge"><Icon name="sparkle" size={12} /> {language === "bn" ? "বিশেষ" : "Featured"}</span>}
              </div>
            </Link>

            <div className="premium-card-info">
              <div className="product-meta">
                <span>{t.collection}</span>
                <span className={product.stock > 0 ? "stock-dot" : "stock-dot sold-out"}>{product.stock > 0 ? t.inStock : t.outOfStock}</span>
              </div>
              <Link href={`/products/${encodeURIComponent(product.slug)}`} className="premium-product-name">{product.name}</Link>
              {product.description && <p className="premium-product-description">{product.description}</p>}
              <div className="premium-card-bottom">
                <div className="price-stack">
                  <strong>{formatPrice(Number(product.price), language)}</strong>
                  {product.compare_at_price != null && Number(product.compare_at_price) > Number(product.price) && (
                    <del>{formatPrice(Number(product.compare_at_price), language)}</del>
                  )}
                </div>
                <button
                  type="button"
                  className="add-cart-icon"
                  disabled={product.stock < 1}
                  onClick={() => addToCart(product, language, setNotice)}
                  aria-label={`${t.add}: ${product.name}`}
                  title={t.add}
                >
                  <Icon name="cart" size={19} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>

  <footer className="premium-footer">
    <a href="#top" className="footer-mark" aria-label="Back to top">N.</a>
    <p>{t.footer}</p>
    <div className="footer-icons">
      <Link href="/account" className="icon-button" aria-label={t.account} title={t.account}><Icon name="user" /></Link>
      <Link href="/track-order" className="icon-button" aria-label={t.track} title={t.track}><Icon name="package" /></Link>
      <Link href="/cart" className="icon-button" aria-label={t.cart} title={t.cart}><Icon name="cart" /></Link>
    </div>
    <small>© {new Date().getFullYear()} NEWEIX. {t.rights}</small>
  </footer>

  <style jsx>{`
    .premium-home {
      --premium-bg: #09090c;
      --premium-panel: #121219;
      --premium-border: rgba(255,255,255,.1);
      --premium-text: #f8f7fb;
      --premium-muted: #aaa8b8;
      --premium-purple: #b9a0ff;
      --premium-pink: #ffb6d9;
      min-height: 100vh;
      overflow: hidden;
      background: var(--premium-bg);
      color: var(--premium-text);
      font-family: Arial, "Noto Sans Bengali", "Hind Siliguri", sans-serif;
    }
    .premium-header {
      position: relative;
      z-index: 5;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 18px;
      min-height: 78px;
      padding: 12px clamp(16px, 5vw, 76px);
      background: rgba(9,9,12,.88);
      border-bottom: 1px solid var(--premium-border);
      backdrop-filter: blur(22px);
    }
    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
      color: #f7f5ff;
      background: linear-gradient(145deg, #1b1b25, #101016);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 15px;
      text-decoration: none;
      cursor: pointer;
      transition: transform .2s ease, border-color .2s ease, background .2s ease;
    }
    .icon-button:hover {
      transform: translateY(-2px);
      border-color: rgba(194,167,255,.65);
      background: linear-gradient(145deg, #292338, #15131c);
    }
    .profile-button { justify-self: start; }
    .wordmark {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      color: white;
      text-decoration: none;
    }
    .wordmark-mark {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 11px;
      color: #0a0910;
      background: linear-gradient(135deg, #fff, #c5b1ff 60%, #ffbde0);
      font-weight: 900;
      font-size: 18px;
    }
    .wordmark-text { font-size: 13px; font-weight: 850; letter-spacing: 3px; }
    .header-actions { display: flex; justify-content: flex-end; align-items: center; gap: 9px; }
    .premium-hero {
      position: relative;
      isolation: isolate;
      min-height: 490px;
      display: flex;
      align-items: center;
      padding: clamp(54px, 9vw, 112px) clamp(22px, 9vw, 140px);
      border-bottom: 1px solid var(--premium-border);
      background:
        radial-gradient(ellipse at 78% 8%, rgba(128,91,255,.24), transparent 35%),
        radial-gradient(ellipse at 86% 85%, rgba(255,115,191,.13), transparent 30%),
        linear-gradient(125deg, #111119 0%, #09090d 52%, #171020 100%);
    }
    .hero-content { position: relative; z-index: 2; max-width: 760px; }
    .hero-orb {
      position: absolute;
      z-index: -1;
      pointer-events: none;
      border-radius: 50%;
      filter: blur(2px);
    }
    .hero-orb-one {
      width: 330px; height: 330px; right: 9%; top: 14%;
      border: 1px solid rgba(204,181,255,.2);
      box-shadow: 0 0 90px rgba(154,114,255,.12), inset 0 0 70px rgba(154,114,255,.06);
    }
    .hero-orb-two {
      width: 220px; height: 220px; right: 14%; top: 24%;
      background: linear-gradient(135deg, rgba(196,177,255,.09), rgba(255,182,220,.04));
      border: 1px solid rgba(255,255,255,.12);
      transform: rotate(-24deg);
      border-radius: 38%;
    }
    .premium-eyebrow, .section-eyebrow {
      display: flex; align-items: center; gap: 9px;
      color: #c6b5ff; font-size: 10px; font-weight: 800; letter-spacing: 2.3px;
    }
    .premium-hero h1 {
      margin: 25px 0 18px;
      font-size: clamp(38px, 6.4vw, 78px);
      line-height: 1.16;
      letter-spacing: -2.8px;
      font-weight: 850;
    }
    .premium-hero h1 span {
      color: transparent;
      background: linear-gradient(95deg, #fff 0%, #c9b5ff 48%, #ffb8dd 100%);
      background-clip: text;
      -webkit-background-clip: text;
    }
    .hero-description {
      max-width: 540px; color: #b7b4c5; font-size: 15px; line-height: 1.95;
    }
    .hero-cta {
      display: inline-flex; align-items: center; justify-content: center; gap: 16px;
      margin-top: 20px; padding: 14px 19px;
      color: #111018; font-weight: 800; font-size: 13px;
      text-decoration: none; border-radius: 14px;
      background: linear-gradient(105deg, #fff, #d8caff 62%, #ffc8e3);
      box-shadow: 0 10px 36px rgba(183,149,255,.18);
      transition: transform .2s ease, box-shadow .2s ease;
    }
    .hero-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 40px rgba(183,149,255,.3); }
    .hero-caption { display: flex; align-items: center; gap: 11px; margin-top: 54px; color: #817d93; font-size: 10px; letter-spacing: 2px; }
    .caption-line { width: 36px; height: 1px; background: linear-gradient(90deg,#b9a0ff,#ffb6d9); }
    .hero-side-note { position: absolute; right: 5%; bottom: 30px; color: rgba(255,255,255,.28); font-size: 10px; letter-spacing: 3px; }
    .premium-products { padding: 75px clamp(18px, 6vw, 90px) 90px; scroll-margin-top: 24px; }
    .section-topline { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
    .section-eyebrow { margin-bottom: 13px; font-size: 9px; }
    .section-topline h2 { margin: 0; font-size: clamp(27px, 3.5vw, 43px); letter-spacing: -1.2px; }
    .section-subtitle { margin: 13px 0 0; color: var(--premium-muted); font-size: 13px; line-height: 1.8; }
    .round-arrow {
      display: grid; place-items: center; width: 48px; height: 48px;
      color: #f8f5ff; border: 1px solid var(--premium-border);
      background: linear-gradient(135deg, #201b2c, #111117); border-radius: 50%;
    }
    .premium-search {
      display: flex; align-items: center; gap: 12px;
      max-width: 650px; min-height: 58px; margin: 34px 0 35px;
      padding: 7px 8px 7px 17px;
      color: #c4b4ff; background: linear-gradient(120deg,#17151f,#101015);
      border: 1px solid rgba(255,255,255,.12); border-radius: 17px;
      box-shadow: 0 12px 35px rgba(0,0,0,.14);
    }
    .premium-search input {
      flex: 1; min-width: 0; min-height: 40px; color: #f8f7fb;
      background: transparent; border: 0; outline: 0; font: inherit; font-size: 13px;
    }
    .premium-search input::placeholder { color: #777486; }
    .search-icon-button, .clear-search {
      display: grid; place-items: center; width: 42px; height: 42px;
      color: #100e17; border: 0; border-radius: 12px;
      background: linear-gradient(135deg,#fff,#c9b7ff,#ffbfdf); cursor: pointer;
    }
    .clear-search { color: #e6e0f5; background: #24212e; border: 1px solid #393347; }
    .premium-notice {
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
      max-width: 650px; padding: 13px 15px; margin-bottom: 24px;
      color: #e8e2ff; background: #191622; border: 1px solid #4a3b64;
      border-radius: 12px; font-size: 13px;
    }
    .premium-notice button { display: grid; place-items: center; color: inherit; background: transparent; border: 0; cursor: pointer; }
    .state-message { color: var(--premium-muted); padding: 25px 0; font-size: 14px; }
    .state-panel { padding: 24px; color: #eee; background: var(--premium-panel); border: 1px solid var(--premium-border); border-radius: 16px; }
    .retry-button { padding: 11px 15px; color: #111; background: #eee7ff; border: 0; border-radius: 10px; font-weight: 700; cursor: pointer; }
    .premium-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 20px; }
    .premium-card {
      min-width: 0; overflow: hidden; background: linear-gradient(160deg,#171720,#101015 75%);
      border: 1px solid rgba(255,255,255,.09); border-radius: 20px;
      transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
    }
    .premium-card:hover { transform: translateY(-5px); border-color: rgba(194,167,255,.38); box-shadow: 0 20px 50px rgba(0,0,0,.28); }
    .product-image-link { display: block; color: inherit; text-decoration: none; }
    .premium-image {
      position: relative; display: grid; place-items: center; overflow: hidden;
      aspect-ratio: 1 / 1; background: linear-gradient(145deg,#252231,#15141c);
    }
    .image-tone-1 { background: linear-gradient(145deg,#25202f,#17131e); }
    .image-tone-2 { background: linear-gradient(145deg,#24242e,#15151b); }
    .image-tone-3 { background: linear-gradient(145deg,#30202d,#17141b); }
    .premium-image img { width: 100%; height: 100%; object-fit: cover; transition: transform .45s ease; }
    .premium-card:hover .premium-image img { transform: scale(1.045); }
    .image-placeholder { display: flex; flex-direction: column; align-items: center; gap: 12px; color: rgba(220,207,255,.65); }
    .image-placeholder span { font-size: 10px; font-weight: 800; letter-spacing: 3px; }
    .featured-badge {
      position: absolute; top: 12px; left: 12px; display: inline-flex; align-items: center; gap: 5px;
      padding: 7px 9px; color: #eee7ff; background: rgba(14,12,21,.8);
      border: 1px solid rgba(255,255,255,.15); border-radius: 999px; font-size: 10px; backdrop-filter: blur(12px);
    }
    .premium-card-info { padding: 17px; }
    .product-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #827d92; font-size: 9px; letter-spacing: 1px; }
    .stock-dot { color: #b9e9ce; letter-spacing: 0; }
    .stock-dot::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: #82d8a5; vertical-align: 1px; }
    .stock-dot.sold-out { color: #f1a5b5; }
    .stock-dot.sold-out::before { background: #e98298; }
    .premium-product-name { display: block; margin-top: 12px; color: #f7f5fb; text-decoration: none; font-size: 15px; font-weight: 750; line-height: 1.55; overflow-wrap: anywhere; }
    .premium-product-name:hover { color: #d3c4ff; }
    .premium-product-description { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; min-height: 36px; margin: 8px 0; color: #9995a8; font-size: 11px; line-height: 1.7; }
    .premium-card-bottom { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 17px; }
    .price-stack { display: flex; flex-wrap: wrap; align-items: baseline; gap: 7px; }
    .price-stack strong { color: #fff; font-size: 15px; }
    .price-stack del { color: #797486; font-size: 11px; }
    .add-cart-icon {
      display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 auto;
      color: #13111a; background: linear-gradient(135deg,#fff,#cbb9ff,#ffc5e2);
      border: 0; border-radius: 13px; cursor: pointer; transition: transform .2s ease;
    }
    .add-cart-icon:hover:not(:disabled) { transform: scale(1.06); }
    .add-cart-icon:disabled { opacity: .35; cursor: not-allowed; }
    .premium-footer {
      display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 20px;
      padding: 28px clamp(18px,6vw,90px); background: #0d0c12; border-top: 1px solid var(--premium-border);
    }
    .footer-mark { color: #d3c3ff; font-size: 25px; font-weight: 900; text-decoration: none; }
    .premium-footer p { color: #a6a1b5; font-size: 12px; }
    .footer-icons { display: flex; gap: 8px; }
    .premium-footer small { grid-column: 1 / -1; color: #716d7e; font-size: 10px; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    :global(.premium-home a:focus-visible), :global(.premium-home button:focus-visible), :global(.premium-home input:focus-visible) { outline: 2px solid #d0bdff; outline-offset: 3px; }
    @media (max-width: 1050px) {
      .premium-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
      .premium-hero { padding-left: 7vw; }
    }
    @media (max-width: 760px) {
      .premium-header { min-height: 68px; padding: 10px 14px; gap: 8px; }
      .wordmark { gap: 0; }
      .wordmark-mark { width: 32px; height: 32px; }
      .wordmark-text { display: none; }
      .icon-button { width: 40px; height: 40px; border-radius: 13px; }
      .header-actions { gap: 6px; }
      .premium-hero { min-height: 440px; padding: 65px 22px 52px; }
      .premium-hero h1 { font-size: clamp(39px, 10vw, 62px); letter-spacing: -1.6px; }
      .hero-description { max-width: 420px; font-size: 13px; }
      .hero-orb-one { width: 210px; height: 210px; right: -45px; top: 9%; opacity: .6; }
      .hero-orb-two { width: 145px; height: 145px; right: 1%; top: 17%; opacity: .55; }
      .hero-side-note { right: 18px; bottom: 17px; }
      .premium-products { padding: 52px 15px 60px; }
      .section-topline h2 { font-size: 27px; }
      .section-subtitle { font-size: 12px; }
      .premium-search { margin: 25px 0; }
      .premium-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 11px; }
      .premium-card { border-radius: 15px; }
      .premium-card-info { padding: 11px; }
      .product-meta { align-items: flex-start; flex-direction: column; gap: 6px; font-size: 8px; }
      .premium-product-name { font-size: 13px; }
      .premium-product-description { font-size: 10px; }
      .price-stack strong { font-size: 12px; }
      .price-stack del { font-size: 9px; }
      .add-cart-icon { width: 36px; height: 36px; border-radius: 11px; }
      .premium-card-bottom { align-items: flex-end; }
      .premium-footer { grid-template-columns: auto 1fr; gap: 10px; padding: 22px 16px; }
      .premium-footer p { margin: 0; }
      .footer-icons { grid-column: 1 / -1; }
      .premium-footer small { margin-top: 8px; }
    }
    @media (max-width: 360px) {
      .desktop-action { display: none; }
      .premium-grid { gap: 8px; }
      .premium-card-info { padding: 9px; }
      .price-stack { gap: 3px; }
      .add-cart-icon { width: 32px; height: 32px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .premium-home *, .premium-home *::before, .premium-home *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
    }
  `}</style>
</main>

);
}