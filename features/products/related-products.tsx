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
  category_id?: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RelatedProducts({ currentProductId, categoryId }: {
  currentProductId: string;
  categoryId: string | null;
}) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!categoryId) return;
    const controller = new AbortController();
    let active = true;

    async function loadRelated() {
      try {
        const response = await fetch("/api/products", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = (await response.json()) as { data?: Product[] };
        if (!Array.isArray(result.data)) return;
        const related = result.data
          .filter((item) => item.id !== currentProductId && item.category_id === categoryId)
          .slice(0, 4);
        if (active) setProducts(related);
      } catch {
        // Related products are optional and must not affect the product page.
      }
    }

    void loadRelated();
    return () => {
      active = false;
      controller.abort();
    };
  }, [categoryId, currentProductId]);

  if (!products.length) return null;

  return (
    <section className={styles.section} aria-labelledby="related-products-title">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>MORE TO EXPLORE</span>
          <h2 id="related-products-title">একই ক্যাটাগরির আরও পণ্য</h2>
        </div>
        <span className={styles.caption}>আপনার পছন্দের সঙ্গে মিল থাকতে পারে</span>
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
