"use client";

import Link from "next/link";
import AddToCartButton from "@/app/products/[slug]/AddToCartButton";
import CompareButton from "@/features/compare/compare-button";
import styles from "./product-details.module.css";

export type ProductDetailsData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_urls: string[] | null;
  stock: number;
};

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 0 }).format(Number(value)) + " ৳";
}

export default function ProductDetails({ product }: { product: ProductDetailsData }) {
  const images = product.image_urls ?? [];
  return (
    <main className={styles.page}>
      <div className={styles.breadcrumb}><Link href="/products">← সব পণ্য</Link><span>/</span><span>{product.name}</span></div>
      <div className={styles.layout}>
        <section className={styles.gallery} aria-label="পণ্যের ছবি">
          {images.length ? images.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src + index} src={src} alt={`${product.name} — ছবি ${index + 1}`} />
          )) : <div className={styles.placeholder}>NEWEIX</div>}
        </section>
        <section className={styles.info}>
          <span className={styles.eyebrow}>NEWEIX PRODUCT</span>
          <h1>{product.name}</h1>
          <div className={styles.priceLine}>
            <strong>{money(product.price)}</strong>
            {product.compare_at_price != null && product.compare_at_price > product.price && <del>{money(product.compare_at_price)}</del>}
          </div>
          <p className={product.stock > 0 ? styles.stock : styles.out}>{product.stock > 0 ? `স্টকে আছে · ${product.stock} টি` : "বর্তমানে স্টক শেষ"}</p>
          {product.description && <p className={styles.description}>{product.description}</p>}
          <AddToCartButton productId={product.id} disabled={product.stock <= 0} maxQuantity={product.stock} />
          <CompareButton productId={product.id} />
          <div className={styles.assurance}><span>নিরাপদ অর্ডার</span><span>বাংলাদেশজুড়ে সেবা</span><span>সহজ অর্ডার ট্র্যাকিং</span></div>
        </section>
      </div>
    </main>
  );
}
