"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import styles from "./portal-home.module.css";

type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price?: number | null;
  image_urls: string[] | null;
  stock: number;
  is_featured?: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PortalHome() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/products", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Products unavailable");
        return response.json() as Promise<{ data?: Product[] }>;
      })
      .then((result) => {
        if (active) setProducts(Array.isArray(result.data) ? result.data : []);
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim();
    window.location.href = term ? `/products?search=${encodeURIComponent(term)}` : "/products";
  }

  function addToCart(product: Product) {
    if (product.stock < 1) return;
    try {
      const raw = localStorage.getItem("neweix_cart");
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");
      const quantities = new Map<string, number>();
      for (const value of parsed) {
        if (!value || typeof value !== "object") continue;
        const item = value as Record<string, unknown>;
        if (typeof item.product_id !== "string" || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1) continue;
        quantities.set(item.product_id, Math.min(100, (quantities.get(item.product_id) ?? 0) + Number(item.quantity)));
      }
      const current = quantities.get(product.id) ?? 0;
      if (current >= Math.min(100, product.stock)) {
        setNotice("স্টকে থাকা সর্বোচ্চ পরিমাণ ইতিমধ্যে কার্টে আছে।");
        return;
      }
      quantities.set(product.id, current + 1);
      localStorage.setItem("neweix_cart", JSON.stringify(
        Array.from(quantities, ([product_id, quantity]) => ({ product_id, quantity }))
      ));
      setNotice("পণ্যটি কার্টে যোগ হয়েছে।");
    } catch {
      setNotice("কার্ট আপডেট করা যায়নি। আবার চেষ্টা করুন।");
    }
  }

  const featured = [...products]
    .sort((a, b) => Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured)))
    .slice(0, 4);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="NEWEIX হোম">
          <span className={styles.logoMark}>N</span>
          <span>NEWEIX</span>
        </Link>
        <nav className={styles.headerLinks} aria-label="প্রধান নেভিগেশন">
          <Link href="/products">পণ্য</Link>
          <Link href="/track-order">অর্ডার ট্র্যাক</Link>
          <Link href="/account" className={styles.iconLink} aria-label="আমার অ্যাকাউন্ট" title="আমার অ্যাকাউন্ট"><Icon name="user" /></Link>
          <Link href="/cart" className={styles.iconLink} aria-label="শপিং কার্ট" title="শপিং কার্ট"><Icon name="cart" /></Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.kicker}><Icon name="sparkles" size={15} /> NEWEIX ONLINE STORE</span>
            <h1>পছন্দের পণ্য,<br /><span>কেনাকাটা আরও সহজ।</span></h1>
            <p className={styles.heroCopy}>আপনার প্রয়োজনীয় পণ্য খুঁজুন, পছন্দ করুন এবং নিরাপদে অর্ডার সম্পন্ন করুন।</p>
            <form className={styles.searchForm} onSubmit={submitSearch} role="search">
              <Icon name="search" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="কোন পণ্যটি খুঁজছেন?" aria-label="পণ্য খুঁজুন" />
              <button type="submit" aria-label="পণ্য খুঁজুন"><Icon name="arrow-right" /></button>
            </form>
            <div className={styles.heroActions}>
              <Link href="/products" className={styles.primaryAction}>সব পণ্য দেখুন <Icon name="arrow-right" /></Link>
              <Link href="/track-order" className={styles.secondaryAction}><Icon name="package" /> অর্ডার ট্র্যাক</Link>
            </div>
          </div>
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.visualOrbit} />
            <div className={styles.visualTile}><Icon name="grid" size={68} strokeWidth={1.2} /></div>
            <span className={styles.visualCaption}>SHOP SMARTER</span>
          </div>
        </section>

        <section className={styles.quickLinks} aria-label="দ্রুত সেবা">
          <Link href="/products"><span className={styles.quickIcon}><Icon name="grid" /></span><span><strong>সব পণ্য</strong><small>ক্যাটালগ দেখুন</small></span><Icon name="arrow-right" size={17} /></Link>
          <Link href="/wishlist"><span className={styles.quickIcon}><Icon name="heart" /></span><span><strong>পছন্দের তালিকা</strong><small>সংরক্ষিত পণ্য</small></span><Icon name="arrow-right" size={17} /></Link>
          <Link href="/track-order"><span className={styles.quickIcon}><Icon name="package" /></span><span><strong>অর্ডার ট্র্যাক</strong><small>ডেলিভারি আপডেট</small></span><Icon name="arrow-right" size={17} /></Link>
          <Link href="/account"><span className={styles.quickIcon}><Icon name="user" /></span><span><strong>আমার অ্যাকাউন্ট</strong><small>প্রোফাইল ও অর্ডার</small></span><Icon name="arrow-right" size={17} /></Link>
        </section>

        <section className={styles.productsSection} aria-labelledby="featured-heading">
          <div className={styles.sectionHead}>
            <div><span className={styles.kicker}>PICKED FOR YOU</span><h2 id="featured-heading">জনপ্রিয় পণ্য</h2><p>পছন্দের পণ্যগুলো এক জায়গায়</p></div>
            <Link href="/products" className={styles.viewAll}>সব পণ্য <Icon name="arrow-right" size={17} /></Link>
          </div>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          {loading && <p className={styles.state}>পণ্য লোড হচ্ছে...</p>}
          {!loading && featured.length === 0 && <div className={styles.emptyState}><Icon name="package" size={30} /><p>নতুন পণ্য শিগগিরই এখানে দেখানো হবে।</p><Link href="/products">পণ্যের তালিকা দেখুন</Link></div>}
          {!loading && featured.length > 0 && (
            <div className={styles.productGrid}>
              {featured.map((product) => (
                <article className={styles.productCard} key={product.id}>
                  <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.productImage} aria-label={`${product.name} দেখুন`}>
                    {product.image_urls?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_urls[0]} alt={product.name} loading="lazy" />
                    ) : <Icon name="package" size={42} />}
                    {product.is_featured && <span className={styles.featuredTag}>জনপ্রিয়</span>}
                  </Link>
                  <div className={styles.productInfo}>
                    <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.productName}>{product.name}</Link>
                    <div className={styles.productBottom}>
                      <div><strong>{money(Number(product.price))}</strong>{product.compare_at_price != null && product.compare_at_price > product.price && <del>{money(Number(product.compare_at_price))}</del>}</div>
                      <button type="button" className={styles.addButton} disabled={product.stock < 1} onClick={() => addToCart(product)} aria-label={`${product.name} কার্টে যোগ করুন`} title="কার্টে যোগ করুন"><Icon name="plus" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className={styles.footer}>
          <div><strong>NEWEIX</strong><span>সহজ কেনাকাটা, নির্ভরযোগ্য অভিজ্ঞতা।</span></div>
          <nav aria-label="সহায়ক লিংক"><Link href="/about">আমাদের সম্পর্কে</Link><Link href="/contact">যোগাযোগ</Link><Link href="/faq">সাহায্য</Link><Link href="/privacy">গোপনীয়তা</Link></nav>
          <small>© {new Date().getFullYear()} NEWEIX. সর্বস্বত্ব সংরক্ষিত।</small>
        </footer>
      </main>
    </div>
  );
}
