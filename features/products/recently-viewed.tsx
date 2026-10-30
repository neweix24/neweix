"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./recently-viewed.module.css";

type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image_urls: string[] | null;
  stock: number;
};

const STORAGE_KEY = "neweix_recently_viewed";
const MAX_HISTORY = 12;
const MAX_DISPLAY = 4;

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RecentlyViewedProducts({ currentProductId }: { currentProductId: string }) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let active = true;

    async function loadRecentlyViewed() {
      let history: string[] = [];
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        if (Array.isArray(parsed)) {
          history = parsed.filter((id): id is string => typeof id === "string" && id.length <= 80);
        }
      } catch {
        history = [];
      }

      const nextHistory = [currentProductId, ...history.filter((id) => id !== currentProductId)]
        .slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
      } catch {
        // Browsing history is optional; the product page remains usable if storage is unavailable.
      }

      const viewedIds = nextHistory.filter((id) => id !== currentProductId).slice(0, MAX_DISPLAY);
      if (!viewedIds.length) return;

      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        if (!response.ok) return;
        const result = (await response.json()) as { data?: Product[] };
        if (!Array.isArray(result.data)) return;

        const byId = new Map(
          result.data
            .filter((item) => item && typeof item.id === "string" && typeof item.slug === "string")
            .map((item) => [item.id, item])
        );
        const ordered = viewedIds
          .map((id) => byId.get(id))
          .filter((item): item is Product => Boolean(item))
          .slice(0, MAX_DISPLAY);
        if (active) setProducts(ordered);
      } catch {
        // Recommendations are non-critical and should never block product details.
      }
    }

    void loadRecentlyViewed();
    return () => {
      active = false;
    };
  }, [currentProductId]);

  if (!products.length) return null;

  return (
    <section className={styles.section} aria-labelledby="recently-viewed-title">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>YOUR BROWSING HISTORY</span>
          <h2 id="recently-viewed-title">সম্প্রতি দেখা পণ্য</h2>
        </div>
        <span className={styles.caption}>আপনি আগে যে পণ্যগুলো দেখেছেন</span>
      </div>
      <div className={styles.grid}>
        {products.map((product) => (
          <article className={styles.card} key={product.id}>
            <Link className={styles.image} href={`/products/${encodeURIComponent(product.slug)}`}>
              {product.image_urls?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_urls[0]} alt={product.name} loading="lazy" />
              ) : (
                <span>NEWEIX</span>
              )}
            </Link>
            <div className={styles.details}>
              <Link className={styles.name} href={`/products/${encodeURIComponent(product.slug)}`}>
                {product.name}
              </Link>
              <strong>{money(product.price)}</strong>
              <small className={product.stock > 0 ? styles.inStock : styles.outOfStock}>
                {product.stock > 0 ? "স্টকে আছে" : "স্টক শেষ"}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
