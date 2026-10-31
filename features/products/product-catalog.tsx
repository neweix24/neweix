"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import styles from "./product-catalog.module.css";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price?: number | null;
  image_urls: string[] | null;
  stock: number;
  category_id?: string | null;
  is_featured?: boolean;
};

type ApiResponse = { data?: Product[] };

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ProductCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"featured" | "price-asc" | "price-desc">("featured");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      if (!response.ok) throw new Error("Product request failed");
      const result = (await response.json()) as ApiResponse;
      if (!Array.isArray(result.data)) throw new Error("Invalid product response");
      setProducts(result.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    const initialSearch = new URLSearchParams(window.location.search).get("search");
    if (initialSearch) setQuery(initialSearch);
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("neweix_wishlist") ?? "[]");
      if (Array.isArray(saved)) setWishlist(Array.from(new Set(saved.filter((id): id is string => typeof id === "string"))).slice(0, 200));
      const compared: unknown = JSON.parse(localStorage.getItem("neweix_compare") ?? "[]");
      if (Array.isArray(compared)) setCompareIds(Array.from(new Set(compared.filter((id): id is string => typeof id === "string"))).slice(0, 4));
    } catch {
      localStorage.removeItem("neweix_wishlist");
    }
  }, [loadProducts]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const matches = !term ? [...products] : products.filter((product) =>
      [product.name, product.description ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(term)
      )
    );
    if (sort === "price-asc") matches.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-desc") matches.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "featured") matches.sort((a, b) => Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured)));
    return matches;
  }, [products, query, sort]);

  function toggleWishlist(product: Product) {
    const next = wishlist.includes(product.id) ? wishlist.filter((id) => id !== product.id) : [...wishlist, product.id].slice(-200);
    try {
      localStorage.setItem("neweix_wishlist", JSON.stringify(next));
      setWishlist(next);
      setNotice(next.includes(product.id) ? "পণ্যটি পছন্দের তালিকায় যোগ হয়েছে।" : "পণ্যটি পছন্দের তালিকা থেকে সরানো হয়েছে।");
    } catch {
      setNotice("পছন্দের তালিকা সংরক্ষণ করা যায়নি।");
    }
  }

  function toggleCompare(product: Product) {
    const next = compareIds.includes(product.id) ? compareIds.filter((id) => id !== product.id) : compareIds.length < 4 ? [...compareIds, product.id] : null;
    if (!next) { setNotice("একসঙ্গে সর্বোচ্চ ৪টি পণ্য তুলনা করা যাবে।"); return; }
    try { localStorage.setItem("neweix_compare", JSON.stringify(next)); setCompareIds(next); setNotice(next.includes(product.id) ? "পণ্যটি তুলনার তালিকায় যোগ হয়েছে।" : "পণ্যটি তুলনা থেকে সরানো হয়েছে।"); window.dispatchEvent(new Event("neweix-compare-change")); }
    catch { setNotice("তুলনার তালিকা সংরক্ষণ করা যায়নি।"); }
  }

  function addToCart(product: Product) {
    if (!Number.isSafeInteger(Number(product.stock)) || Number(product.stock) < 1) {
      setNotice("পণ্যটি বর্তমানে স্টকে নেই।");
      return;
    }
    try {
      const raw = localStorage.getItem("neweix_cart");
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");
      const quantities = new Map<string, number>();
      for (const value of parsed) {
        if (!value || typeof value !== "object") continue;
        const item = value as Record<string, unknown>;
        if (typeof item.product_id !== "string" || !item.product_id ||
            !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1) continue;
        quantities.set(item.product_id, Math.min(100, (quantities.get(item.product_id) ?? 0) + Number(item.quantity)));
      }
      const current = quantities.get(product.id) ?? 0;
      if (current >= Math.min(100, Number(product.stock))) {
        setNotice("স্টকে থাকা সর্বোচ্চ পরিমাণ ইতিমধ্যে কার্টে আছে।");
        return;
      }
      quantities.set(product.id, current + 1);
      const cart = Array.from(quantities, ([product_id, quantity]) => ({ product_id, quantity }));
      localStorage.setItem("neweix_cart", JSON.stringify(cart));
      setNotice("পণ্যটি কার্টে যোগ হয়েছে।");
    } catch {
      setNotice("কার্ট আপডেট করা যায়নি। আবার চেষ্টা করুন।");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>NEWEIX</Link>
        <nav aria-label="প্রধান নেভিগেশন">
          <Link href="/track-order">অর্ডার ট্র্যাক</Link>
          <Link href="/account">অ্যাকাউন্ট</Link>
          <Link href="/wishlist">পছন্দের তালিকা ({wishlist.length})</Link>
          <Link href="/compare">তুলনা ({compareIds.length})</Link>
          <Link href="/cart">কার্ট</Link>
        </nav>
      </header>

      <section className={styles.intro}>
        <span className={styles.eyebrow}>NEWEIX COLLECTION</span>
        <h1>পণ্য আবিষ্কার করুন</h1>
        <p>আপনার পছন্দের পণ্য খুঁজুন এবং সহজেই অর্ডার করুন।</p>
        <label className={styles.search}>
          <span className={styles.srOnly}>পণ্য খুঁজুন</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="পণ্যের নাম লিখুন..."
          />
        </label>
        <label className={styles.search} style={{ marginTop: 12 }}>
          <span className={styles.srOnly}>পণ্যের সাজানোর ধরন</span>
          <select aria-label="পণ্য সাজান" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="featured">বিশেষ পণ্য আগে</option>
            <option value="price-asc">দাম: কম থেকে বেশি</option>
            <option value="price-desc">দাম: বেশি থেকে কম</option>
          </select>
        </label>
        <p aria-live="polite" style={{ marginTop: 12 }}>{filtered.length}টি পণ্য পাওয়া গেছে</p>
      </section>

      <section className={styles.catalog} aria-label="পণ্যের তালিকা">
        {notice && (
          <div className={styles.notice} role="status">
            {notice}
            <button type="button" onClick={() => setNotice("")} aria-label="বার্তা বন্ধ করুন" title="বন্ধ করুন" className={styles.iconButton}><Icon name="close" size={17} /></button>
          </div>
        )}
        {loading && <p className={styles.state}>পণ্য লোড হচ্ছে...</p>}
        {!loading && error && (
          <div className={styles.state}>
            <p>পণ্য লোড করা যায়নি। আবার চেষ্টা করুন।</p>
            <button type="button" onClick={() => void loadProducts()} className={styles.actionButton}><Icon name="refresh" size={16} /> আবার চেষ্টা করুন</button>
          </div>
        )}
        {!loading && !error && products.length === 0 && (
          <p className={styles.state}>এখনো কোনো সক্রিয় পণ্য পাওয়া যায়নি।</p>
        )}
        {!loading && !error && products.length > 0 && filtered.length === 0 && (
          <p className={styles.state}>আপনার অনুসন্ধানের সঙ্গে মেলে এমন পণ্য পাওয়া যায়নি।</p>
        )}
        <div className={styles.grid}>
          {filtered.map((product) => (
            <article className={styles.card} key={product.id}>
              <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.image}>
                {product.image_urls?.[0] ? (
                  <img src={product.image_urls[0]} alt={product.name} loading="lazy" />
                ) : (
                  <span>NEWEIX</span>
                )}
                {product.is_featured && <small>বিশেষ পণ্য</small>}
              </Link>
              <div className={styles.details}>
                <div className={styles.productTools}>
                  <button type="button" aria-pressed={wishlist.includes(product.id)} aria-label={wishlist.includes(product.id) ? "পছন্দের তালিকা থেকে সরান" : "পছন্দের তালিকায় যোগ করুন"} title={wishlist.includes(product.id) ? "পছন্দে আছে" : "পছন্দে রাখুন"} onClick={() => toggleWishlist(product)} className={styles.iconButton}><Icon name="heart" size={17} /></button>
                  <button type="button" aria-pressed={compareIds.includes(product.id)} aria-label={compareIds.includes(product.id) ? "তুলনা থেকে সরান" : "তুলনায় যোগ করুন"} title={compareIds.includes(product.id) ? "তুলনায় আছে" : "তুলনা করুন"} onClick={() => toggleCompare(product)} className={styles.iconButton}><Icon name="compare" size={17} /></button>
                </div>
                <span className={product.stock > 0 ? styles.inStock : styles.outOfStock}>
                  {product.stock > 0 ? "স্টকে আছে" : "স্টক শেষ"}
                </span>
                <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.name}>
                  {product.name}
                </Link>
                {product.description && <p>{product.description}</p>}
                <div className={styles.bottom}>
                  <div>
                    <strong>{money(Number(product.price))}</strong>
                    {product.compare_at_price != null && product.compare_at_price > product.price && (
                      <del>{money(Number(product.compare_at_price))}</del>
                    )}
                  </div>
                  <button type="button" disabled={product.stock < 1} onClick={() => addToCart(product)} className={styles.addButton} aria-label={`${product.name} কার্টে যোগ করুন`} title="কার্টে যোগ করুন"><Icon name="plus" size={19} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
