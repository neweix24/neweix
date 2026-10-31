"use client";

import Link from "next/link";
import AddToCartButton from "@/app/products/[slug]/AddToCartButton";
import CompareButton from "@/features/compare/compare-button";
import ProductReviewPanel from "@/features/reviews/product-review-panel";
import RecentlyViewedProducts from "@/features/products/recently-viewed";
import RelatedProducts from "@/features/products/related-products";
import styles from "./product-details.module.css";

export type ProductDetailsData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_urls: string[] | null;
  video_url?: string | null;
  variants?: unknown;
  sku?: string | null;
  stock: number;
  category_id?: string | null;
};

function getYouTubeEmbedUrl(rawUrl?: string | null): string | null {
  if (!rawUrl?.trim()) return null;

  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^www[.]/, "").replace(/^m[.]/, "");
    let videoId: string | null = null;

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) videoId = parts[1] ?? null;
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch {
    return null;
  }
}

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 0 }).format(Number(value)) + " ৳";
}

export default function ProductDetails({ product }: { product: ProductDetailsData }) {
  const images = product.image_urls ?? [];\n  const videoEmbedUrl = getYouTubeEmbedUrl(product.video_url);
  return (
    <main className={styles.page}>
      <div className={styles.breadcrumb}><Link href="/products">← সব পণ্য</Link><span>/</span><span>{product.name}</span></div>
      <div className={styles.layout}>
        <section className={styles.gallery} aria-label="পণ্যের ছবি">
          {images.length ? images.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src + index} src={src} alt={`${product.name} — ছবি ${index + 1}`} />
          )) : <div className={styles.placeholder}>NEWEIX</div>}
          {videoEmbedUrl && (
            <div className={styles.productVideo}>
              <iframe
                src={videoEmbedUrl}
                title={product.name + " পণ্যের ভিডিও"}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          )}
        </section>
        <section className={styles.info}>
          <span className={styles.eyebrow}>NEWEIX PRODUCT</span>
          <h1>{product.name}</h1>
          <div className={styles.priceLine}>
            <strong>{money(product.price)}</strong>
            {product.compare_at_price != null && product.compare_at_price > product.price && <del>{money(product.compare_at_price)}</del>}
          </div>
          <p className={product.stock > 0 ? styles.stock : styles.out}>{product.stock > 0 ? `স্টকে আছে · ${product.stock} টি` : "বর্তমানে স্টক শেষ"}</p>
          {product.description?.trim() ? <p className={styles.description}>{product.description}</p> : <p className={styles.description}>এই পণ্যের বিস্তারিত বিবরণ এখনো যোগ করা হয়নি। পণ্য সম্পর্কে জানতে আমাদের সঙ্গে যোগাযোগ করুন।</p>}
          {product.sku && <p className={styles.productMeta}>পণ্য কোড: <strong>{product.sku}</strong></p>}
          {Array.isArray(product.variants) && product.variants.length > 0 && (
            <section className={styles.variants} aria-label="পণ্যের ভ্যারিয়েন্ট">
              <h2>উপলভ্য অপশন</h2>
              <ul>{product.variants.map((variant, index) => (
                <li key={index}>{typeof variant === "string" ? variant : JSON.stringify(variant)}</li>
              ))}</ul>
            </section>
          )}
          <AddToCartButton productId={product.id} disabled={product.stock <= 0} maxQuantity={product.stock} />
          <CompareButton productId={product.id} />
          <div className={styles.assurance}><span>নিরাপদ অর্ডার</span><span>বাংলাদেশজুড়ে সেবা</span><span>সহজ অর্ডার ট্র্যাকিং</span></div>
        </section>
      </div>
      <ProductReviewPanel productId={product.id} returnTo={"/products/" + encodeURIComponent(product.slug)} />
      <RelatedProducts currentProductId={product.id} categoryId={product.category_id ?? null} />
      <RecentlyViewedProducts currentProductId={product.id} />
    </main>
  );
}
