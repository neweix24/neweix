"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");

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
  }, [loadProducts]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      [product.name, product.description ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(term)
      )
    );
  }, [products, query]);

  function addToCart(product: Product) {
    if (product.stock < 1) {
      setNotice("পণ্যটি বর্তমানে স্টকে নেই।");
      return;
    }
    try {
      const raw = localStorage.getItem("neweix_cart");
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");
      const cart = parsed as { product_id: string; quantity: number }[];
      const existing = cart.find((item) => item.product_id === product.id);
      if (existing) {
        if (!Number.isSafeInteger(existing.quantity) || existing.quantity < 1) {
          throw new Error("Invalid quantity");
        }
        if (existing.quantity >= product.stock) {
          setNotice("স্টকে থাকা সর্বোচ্চ পরিমাণ কার্টে আছে।");
          return;
        }
        existing.quantity += 1;
      } else {
        cart.push({ product_id: product.id, quantity: 1 });
      }
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
      </section>

      <section className={styles.catalog} aria-label="পণ্যের তালিকা">
        {notice && (
          <div className={styles.notice} role="status">
            {notice}
            <button type="button" onClick={() => setNotice("")} aria-label="বার্তা বন্ধ করুন">×</button>
          </div>
        )}
        {loading && <p className={styles.state}>পণ্য লোড হচ্ছে...</p>}
        {!loading && error && (
          <div className={styles.state}>
            <p>পণ্য লোড করা যায়নি। আবার চেষ্টা করুন।</p>
            <button type="button" onClick={() => void loadProducts()}>আবার চেষ্টা করুন</button>
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
                  <button type="button" disabled={product.stock < 1} onClick={() => addToCart(product)}>
                    কার্টে যোগ
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
