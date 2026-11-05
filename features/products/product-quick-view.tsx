"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import ProductCardActions from "@/features/products/product-card-actions";
import { useLanguage } from "@/components/language-provider";
import styles from "./product-quick-view.module.css";

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

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ProductQuickView({
  product,
  onClose,
  onNotice,
}: {
  product: Product;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const { t, locale } = useLanguage();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button:not([disabled]), [role="dialog"] a[href], [role="dialog"] input:not([disabled]), [role="dialog"] select:not([disabled]), [role="dialog"] textarea:not([disabled])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const discount = product.compare_at_price && product.compare_at_price > product.price
    ? Math.round((1 - product.price / product.compare_at_price) * 100)
    : 0;

  return (
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="quick-view-title">
        <button ref={closeButtonRef} type="button" className={styles.close}
          onClick={onClose} aria-label={t("closeMessage")} title={t("closeMessage")}>
          <Icon name="close" size={20} />
        </button>
        <div className={styles.layout}>
          <div className={styles.visual}>
            {product.image_urls?.[0] ? (
              <img src={product.image_urls[0]} alt={product.name} />
            ) : (
              <span>NEWEIX</span>
            )}
            {discount > 0 && <span className={styles.discount}>{discount}% {locale === "bn" ? "ছাড়" : "OFF"}</span>}
          </div>
          <div className={styles.content}>
            <span className={product.stock > 0 ? styles.available : styles.unavailable}>
              <span aria-hidden="true" /> {product.stock > 0 ? t("inStock") : t("outOfStock")}
            </span>
            <h2 id="quick-view-title">{product.name}</h2>
            <div className={styles.price}>
              <strong>{money(Number(product.price), locale)}</strong>
              {product.compare_at_price != null && product.compare_at_price > product.price && (
                <del>{money(Number(product.compare_at_price), locale)}</del>
              )}
            </div>
            {product.description && <p className={styles.description}>{product.description}</p>}
            <div className={styles.actions}>
              <ProductCardActions productId={product.id} stock={product.stock} onNotice={onNotice} />
            </div>
            <Link className={styles.detailsLink} href={`/products/${encodeURIComponent(product.slug)}`} onClick={onClose}>
              {t("viewDetails")} <Icon name="arrow-right" size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
