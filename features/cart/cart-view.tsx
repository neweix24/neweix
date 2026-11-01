"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import styles from "./cart-view.module.css";

type Product = {
  id: string;
  name: string;
  price: number;
  image_urls: string[] | null;
  stock: number;
};
type CartItem = { product_id: string; quantity: number };

function formatPrice(price: number, locale: string) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", {
    style: "currency", currency: "BDT", maximumFractionDigits: 0,
  }).format(price);
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.product_id === "string" && item.product_id.length > 0 &&
    Number.isSafeInteger(item.quantity) && Number(item.quantity) > 0 && Number(item.quantity) <= 100;
}

export default function CartView() {
  const { t, locale } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("neweix_cart");
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");
      const merged = new Map<string, number>();
      for (const item of parsed.filter(isCartItem)) {
        merged.set(item.product_id, Math.min(100, (merged.get(item.product_id) ?? 0) + item.quantity));
      }
      const normalized = Array.from(merged, ([product_id, quantity]) => ({ product_id, quantity }));
      setCart(normalized);
      localStorage.setItem("neweix_cart", JSON.stringify(normalized));
    } catch {
      setCart([]);
      setError(t("cartReadError"));
    }

    async function loadProducts() {
      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data)) throw new Error(t("productLoadError"));
        setProducts(result.data);
      } catch {
        setError(t("productLoadError"));
      } finally {
        setLoading(false);
      }
    }
    void loadProducts();
  }, []);

  function saveCart(next: CartItem[]) {
    setCart(next);
    localStorage.setItem("neweix_cart", JSON.stringify(next));
    window.dispatchEvent(new Event("neweix-cart-change"));
  }

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const items = cart.flatMap((entry) => {
    const product = productMap.get(entry.product_id);
    return product ? [{ product, quantity: entry.quantity }] : [];
  });
  const unavailable = cart.filter((entry) => !productMap.has(entry.product_id));
  const stockIssues = items.filter(({ product, quantity }) => quantity > product.stock || product.stock < 1);
  const total = items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  function changeQuantity(product: Product, change: number) {
    const item = cart.find((entry) => entry.product_id === product.id);
    if (!item) return;
    const nextQuantity = item.quantity + change;
    if (nextQuantity < 1) {
      saveCart(cart.filter((entry) => entry.product_id !== product.id));
      return;
    }
    if (nextQuantity > product.stock || nextQuantity > 100) {
      setNotice(t("tooManyInCart"));
      return;
    }
    setNotice("");
    saveCart(cart.map((entry) => entry.product_id === product.id ? { ...entry, quantity: nextQuantity } : entry));
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>NEWEIX · YOUR CART</p>
            <h1>{t("cartTitle")}</h1>
            <p className={styles.intro}>{t("reviewCart")}</p>
          </div>
          <Link href="/products" className={styles.continue}><Icon name="arrow-right" size={16} /> {t("continueShopping")}</Link>
        </header>

        <div className={styles.trustRow} aria-label="Shopping information">
          <span><Icon name="shield" size={16} /> Secure checkout</span>
          <span><Icon name="truck" size={16} /> Delivery across Bangladesh</span>
          <span><Icon name="refresh" size={16} /> Stock checked at checkout</span>
        </div>

        {notice && <p role="status" className={styles.notice}>{notice}</p>}
        {loading && <p aria-live="polite" className={styles.state}>{t("cartLoading")}</p>}
        {!loading && error && <div role="alert" className={styles.error}>{error}</div>}

        {!loading && !error && unavailable.length > 0 && (
          <div className={styles.warning}>
            <p>{unavailable.length} {t("unavailableCartItems")}</p>
            <button type="button" onClick={() => saveCart(cart.filter((entry) => productMap.has(entry.product_id)))}><Icon name="trash" size={16} /> {t("removeUnavailable")}</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <section className={styles.empty}>
            <span className={styles.emptyIcon}><Icon name="cart" size={30} /></span>
            <h2>{t("emptyCart")}</h2>
            <p>{t("addProductsToStart")}</p>
            <Link href="/products" className={styles.primaryAction}><Icon name="grid" size={17} /> {t("browseProducts")}</Link>
          </section>
        )}

        {!loading && !error && items.length > 0 && (
          <div className={styles.layout}>
            <section className={styles.items} aria-label={t("cartProducts")}>
              <div className={styles.sectionHeading}>
                <h2>{t("cartProducts")}</h2>
                <span>{itemCount} {t("itemCount")}</span>
              </div>
              {items.map(({ product, quantity }) => (
                <article key={product.id} className={styles.item}>
                  {product.image_urls?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_urls[0]} alt={product.name} loading="lazy" className={styles.image} />
                  ) : <div className={styles.imageFallback}>NEWEIX</div>}
                  <div className={styles.details}>
                    <h3>{product.name}</h3>
                    <p className={styles.unitPrice}>{formatPrice(Number(product.price), locale)} <span>· {t("stock")} {product.stock}</span></p>
                    {quantity > product.stock && <p role="alert" className={styles.stockError}>{t("tooManyInCart")}</p>}
                    <div className={styles.controls}>
                      <div className={styles.quantity} aria-label={t("cartProducts")}>
                        <button type="button" aria-label={product.name + " " + t("decreaseQuantity")} onClick={() => changeQuantity(product, -1)}><Icon name="minus" size={15} /></button>
                        <span aria-live="polite">{quantity}</span>
                        <button type="button" aria-label={product.name + " " + t("increaseQuantity")} disabled={quantity >= product.stock} onClick={() => changeQuantity(product, 1)}><Icon name="plus" size={15} /></button>
                      </div>
                      <button type="button" className={styles.remove} onClick={() => saveCart(cart.filter((entry) => entry.product_id !== product.id))}><Icon name="trash" size={15} /> {t("remove")}</button>
                    </div>
                  </div>
                  <strong className={styles.lineTotal}>{formatPrice(Number(product.price) * quantity, locale)}</strong>
                </article>
              ))}
            </section>

            <aside className={styles.summary}>
              <h2>{t("orderSummary")}</h2>
              <div className={styles.summaryRow}><span>{t("products")} ({itemCount})</span><strong>{formatPrice(total, locale)}</strong></div>
              <div className={styles.summaryRow}><span>{t("delivery")}</span><span className={styles.muted}>{t("confirmedAtCheckout")}</span></div>
              <div className={styles.summaryTotal}><span>{t("total")}</span><strong>{formatPrice(total, locale)}</strong></div>
              <p className={styles.summaryNote}>Delivery charges are calculated from your destination at checkout.</p>
              {stockIssues.length > 0 && <p role="alert" className={styles.stockError}>{t("fixQuantity")}</p>}
              {unavailable.length > 0 && <p className={styles.stockError}>{t("removeUnavailableFirst")}</p>}
              {stockIssues.length === 0 && unavailable.length === 0 ? (
                <Link href="/checkout" className={styles.checkout}><Icon name="lock" size={17} /> {t("proceedCheckout")} <Icon name="arrow-right" size={17} /></Link>
              ) : <button type="button" disabled className={styles.checkoutDisabled}><Icon name="shield" size={17} /> {t("fixCartFirst")}</button>}
              <Link href="/products" className={styles.backLink}>{t("continueShopping")}</Link>
              <div className={styles.secureNote}><Icon name="shield" size={16} /><span>Your order is rechecked for current price and stock before it is placed.</span></div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
