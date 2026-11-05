"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";
import styles from "./storefront-home.module.css";
import HomepageYouTubeVideos from "@/features/portal/homepage-youtube-videos";
import ProductCardActions from "@/features/products/product-card-actions";
import { mutateSavedProduct } from "@/lib/customer-saved-products";
import { useLanguage } from "@/components/language-provider";
import LanguageSwitcher from "@/components/language-switcher";

type Product = {
  id: string; name: string; slug: string; price: number;
  compare_at_price?: number | null; image_urls: string[] | null;
  stock: number; is_featured?: boolean; category_id?: string | null;
};
type Category = { id: string; name: string; slug: string };
type CustomerNotification = { id: string; event_type: string; title: string; body: string; href: string; read_at: string | null; created_at: string };

function discountPercentage(price: number, compareAtPrice?: number | null) {
  if (!compareAtPrice || compareAtPrice <= price || price < 0) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}
function readWishlistIds() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("neweix_wishlist") ?? "[]");
    return Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === "string"))).slice(0, 200) : [];
  } catch { return []; }
}
function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);
}
function readCartCount() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("neweix_cart") ?? "[]");
    return Array.isArray(value) ? value.reduce((sum, item) => {
      if (!item || typeof item !== "object") return sum;
      const row = item as Record<string, unknown>;
      return sum + (typeof row.product_id === "string" && Number.isSafeInteger(row.quantity) && Number(row.quantity) > 0 ? Number(row.quantity) : 0);
    }, 0) : 0;
  } catch { return 0; }
}

export default function StorefrontHome() {
  const { t, locale } = useLanguage();
  const pathname = usePathname();
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cartNotice, setCartNotice] = useState("");
  const quickMenuRef = useRef<HTMLDivElement>(null);

  function toggleHomepageWishlist(productId: string) {
    const next = wishlistIds.includes(productId)
      ? wishlistIds.filter((id) => id !== productId)
      : [...wishlistIds, productId].slice(-200);
    try {
      localStorage.setItem("neweix_wishlist", JSON.stringify(next));
      setWishlistIds(next);
      setWishlistCount(next.length);
      window.dispatchEvent(new Event("neweix-wishlist-change"));
      void mutateSavedProduct("wishlist", productId, next.includes(productId) ? "add" : "remove")
        .then((result) => { if (!result.ok) setCartNotice(result.error || "Could not sync your wishlist."); });
    } catch {
      setCartNotice("Could not save your wishlist. Please try again.");
    }
  }

  const refreshCounts = useCallback(() => {
    setCartCount(readCartCount());
    const savedWishlist = readWishlistIds();
    setWishlistIds(savedWishlist);
    setWishlistCount(savedWishlist.length);
  }, []);

  useEffect(() => {
    refreshCounts();
    const refresh = () => refreshCounts();
    window.addEventListener("storage", refresh);
    window.addEventListener("neweix-cart-change", refresh);
    window.addEventListener("neweix-wishlist-change", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("neweix-cart-change", refresh);
      window.removeEventListener("neweix-wishlist-change", refresh);
    };
  }, [refreshCounts]);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        // One small public response replaces two uncached requests and avoids
        // downloading product fields that the homepage never renders.
        const response = await fetch("/api/public/homepage");
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.products)) {
          throw new Error("Homepage products unavailable");
        }

        if (!active) return;
        const homepageProducts = result.products as Product[];
        setProducts(homepageProducts);

        if (Array.isArray(result.categories)) {
          const categoryIds = new Set(
            homepageProducts
              .map((product) => product.category_id)
              .filter((id): id is string => typeof id === "string")
          );
          const validCategories = (result.categories as Category[]).filter(
            (category) =>
              typeof category?.id === "string" &&
              typeof category.name === "string" &&
              typeof category.slug === "string" &&
              categoryIds.has(category.id)
          );
          setCategories(validCategories);
        }
      } catch {
        if (active) {
          setProducts([]);
          setCategories([]);
        }
      } finally {
        if (active) setProductsLoading(false);
      }
    }

    void loadProducts();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/account/notifications", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as { notifications?: CustomerNotification[]; unread_count?: number };
      })
      .then((result) => {
        if (!active || !result) return;
        setNotifications(Array.isArray(result.notifications) ? result.notifications : []);
        setUnreadNotifications(Number.isSafeInteger(result.unread_count) ? Math.max(0, result.unread_count ?? 0) : 0);
      })
      .catch(() => { /* The inbox retries when opened. */ });
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => {
    if (!notificationsOpen) return;
    let active = true;
    setNotificationsLoading(true);
    setNotificationsError("");
    fetch("/api/account/notifications", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "Sign in to view your notifications." : result.error || "Notifications are unavailable.");
        return result as { notifications?: CustomerNotification[]; unread_count?: number };
      })
      .then((result) => {
        if (!active) return;
        setNotifications(Array.isArray(result.notifications) ? result.notifications : []);
        setUnreadNotifications(Number.isSafeInteger(result.unread_count) ? Math.max(0, result.unread_count ?? 0) : 0);
      })
      .catch((error: unknown) => {
        if (active) setNotificationsError(error instanceof Error ? error.message : "Notifications are unavailable.");
      })
      .finally(() => { if (active) setNotificationsLoading(false); });
    return () => { active = false; };
  }, [notificationsOpen]);

  async function markNotificationRead(id: string) {
    const target = notifications.find((item) => item.id === id);
    if (!target || target.read_at) return;
    const response = await fetch("/api/account/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return;
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: readAt } : item));
    setUnreadNotifications((count) => Math.max(0, count - 1));
  }

  async function markAllNotificationsRead() {
    if (!unreadNotifications) return;
    const response = await fetch("/api/account/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all_read: true }),
    });
    if (!response.ok) return;
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
    setUnreadNotifications(0);
  }

  useEffect(() => {
    if (!quickMenuOpen && !notificationsOpen) return;
    function closeOnOutsideClick(event: globalThis.PointerEvent) {
      if (event.target instanceof Node && !quickMenuRef.current?.contains(event.target)) {
        setQuickMenuOpen(false);
        setNotificationsOpen(false);
      }
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setQuickMenuOpen(false);
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [quickMenuOpen, notificationsOpen]);


  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/" className={styles.brand} aria-label="NEWEIX home">
            <img src="/neweix-logo.svg" alt="NEWEIX" width="148" height="32" />
          </Link>
          <div ref={quickMenuRef} className={styles.headerQuickMenu}>
            <button type="button" className={styles.notificationTrigger} aria-label="Notifications" aria-haspopup="true" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((open) => !open); setQuickMenuOpen(false); }}>
              <Icon name="bell" size={19} />{unreadNotifications > 0 && <span className={styles.notificationBadge}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
            </button>
            {notificationsOpen && <section className={styles.notificationPanel} aria-label="Notifications" aria-busy={notificationsLoading}>
              <div className={styles.notificationHeader}>
                <strong>Notifications{unreadNotifications > 0 ? ` (${unreadNotifications})` : ""}</strong>
                {unreadNotifications > 0 && <button type="button" onClick={() => void markAllNotificationsRead()}>Mark all read</button>}
              </div>
              {notificationsLoading ? <p className={styles.notificationMessage}>Loading notifications…</p> :
                notificationsError ? <p className={styles.notificationMessage} role="status">{notificationsError}</p> :
                notifications.length === 0 ? <div className={styles.notificationEmpty}><Icon name="bell" size={23} /><p>You’re all caught up.</p><span>Order, payment and delivery updates will appear here.</span></div> :
                <div className={styles.notificationList}>{notifications.map((item) => <Link key={item.id} href={item.href} className={item.read_at ? styles.notificationItem : styles.notificationItemUnread} onClick={() => { void markNotificationRead(item.id); setNotificationsOpen(false); }}>
                  <span className={styles.notificationDot} aria-hidden="true" />
                  <span className={styles.notificationCopy}><b>{item.title}</b><span>{item.body}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium", timeStyle: "short" })}</time></span>
                </Link>)}</div>}
            </section>}
            <button type="button" className={styles.quickMenuTrigger} aria-label="Open navigation menu" aria-haspopup="true" aria-expanded={quickMenuOpen} onClick={() => { setQuickMenuOpen((open) => !open); setNotificationsOpen(false); }}>
              <Icon name="menu" size={22} />
            </button>
            {quickMenuOpen && <nav className={styles.quickMenuPanel} aria-label="Quick links">
              <Link href="/orders" onClick={() => setQuickMenuOpen(false)}><Icon name="orders" size={17} />{t("myOrders")}</Link>
              <Link href="/track-order" onClick={() => setQuickMenuOpen(false)}><Icon name="truck" size={17} />{t("trackMyOrder")}</Link>
              <Link href="/wishlist" onClick={() => setQuickMenuOpen(false)}><Icon name="heart" size={17} />{t("wishlist")}<b>{wishlistCount}</b></Link>
              <Link href="/cart" onClick={() => setQuickMenuOpen(false)}><Icon name="cart" size={17} />{t("shoppingCart")}<b>{cartCount}</b></Link>
              <div className={styles.quickMenuLanguage}><Icon name="globe" size={17} /><LanguageSwitcher /></div>
              <Link href="/account/eixpay" onClick={() => setQuickMenuOpen(false)}><Icon name="wallet" size={17} />Wallet · Eixon</Link>
              <Link href="/account/neweix-plus" onClick={() => setQuickMenuOpen(false)}><Icon name="membership" size={17} />Neweix+</Link>
              <Link href="/eixverse" onClick={() => setQuickMenuOpen(false)}><Icon name="globe" size={17} />EixVerse</Link>
              <Link href="/faq" onClick={() => setQuickMenuOpen(false)}><Icon name="help" size={17} />{t("faq")}</Link>
              <Link href="/contact" onClick={() => setQuickMenuOpen(false)}><Icon name="mail" size={17} />{t("contact")}</Link>
            </nav>}
          </div>
        </div>
        <Link href="/products" className={styles.headerSearch} role="search" aria-label={t("searchProducts")}>
          <span className={styles.searchLeadingIcon} aria-hidden="true"><Icon name="search" size={19} /></span>
          <span className={styles.searchPlaceholder}>{t("searchProducts")}</span>
          <span className={styles.searchAction} aria-hidden="true"><Icon name="arrow-right" size={18} /></span>
        </Link>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="home-hero-title">
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>{t("homeHeroEyebrow")}</span>
            <h1 id="home-hero-title">{t("homeHeroTitle")}</h1>
            <p>{t("homeHeroCopy")}</p>
            <div className={styles.heroActions}>
              <Link href="/products" className={styles.primaryButton}>{t("homeHeroShop")} <Icon name="arrow-right" size={17} /></Link>
              <Link href="/track-order" className={styles.secondaryButton}>{t("homeHeroTrack")}</Link>
            </div>
            <div className={styles.trustLine}>
              <span>✓</span> {t("homeHeroSecure")} <span>✓</span> {t("homeHeroDelivery")} <span>✓</span> {t("homeHeroTrust")}
            </div>
          </div>
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.heroOrbit} />
            <div className={styles.heroMonogram}>N</div>
            <div className={styles.heroFloatTag}>NEWEIX<br />SMART SHOPPING</div>
          </div>
        </section>
        {categories.length > 0 && <section className={styles.categorySection} aria-labelledby="category-title">
          <div className={styles.categoryHeading}><div><span className={styles.eyebrow}>SHOP BY CATEGORY</span><h2 id="category-title">{t("categories")}</h2></div><Link href="/products">{t("allCategories")} <Icon name="arrow-right" size={16} /></Link></div>
          <div className={styles.categoryList}>
            {categories.map((category) => <Link key={category.id} href={`/products?category=${encodeURIComponent(category.slug)}`}>{category.name}<Icon name="arrow-right" size={15} /></Link>)}
          </div>
        </section>}

        <HomepageYouTubeVideos />

        <section className={styles.productSection} aria-labelledby="featured-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>DISCOVER NEWEIX</span><h2 id="featured-title">{t("picksForYou")}</h2><p>{t("chooseFromStore")}</p></div><Link href="/products">{t("viewAllProducts")} <Icon name="arrow-right" size={16} /></Link></div>
          {cartNotice && <p className={styles.cartNotice} role="status">{cartNotice}<button type="button" onClick={() => setCartNotice("")} aria-label={t("closeMessage")}><Icon name="close" size={17} /></button></p>}
          {productsLoading ? (
            <div className={styles.productGrid} role="status" aria-label="Loading featured products" aria-busy="true">
              {Array.from({ length: 8 }, (_, index) => (
                <article className={styles.productCard} key={`product-skeleton-${index}`}>
                  <div className={styles.productImage} aria-hidden="true" style={{ aspectRatio: "4 / 3", minHeight: 150, borderRadius: 12, background: "linear-gradient(100deg, #edf2ed 20%, #f7faf7 38%, #edf2ed 56%)" }} />
                  <div className={styles.productInfo}>
                    <span aria-hidden="true" style={{ display: "block", width: "78%", height: 14, margin: "4px 0 12px", borderRadius: 8, background: "#edf2ed" }} />
                    <span aria-hidden="true" style={{ display: "block", width: "42%", height: 17, marginBottom: 12, borderRadius: 8, background: "#edf2ed" }} />
                    <span aria-hidden="true" style={{ display: "block", width: "100%", height: 38, borderRadius: 10, background: "#f1f5f1" }} />
                  </div>
                </article>
              ))}
            </div>
          ) : products.length ? (
            <div className={styles.productGrid}>{products.map((product) => (
              <article className={styles.productCard} key={product.id}>
                <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.productImage}>
                  {product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name} loading="lazy"/> : <Icon name="package" size={42} />}
                  {product.is_featured && <small>{t("featured")}</small>}
                  {discountPercentage(product.price, product.compare_at_price) > 0 && <span className={styles.discountBadge}>{discountPercentage(product.price, product.compare_at_price)}% {locale === "bn" ? "ছাড়" : "OFF"}</span>}
                </Link>
                <button
                  type="button"
                  className={styles.homeWishlist}
                  aria-pressed={wishlistIds.includes(product.id)}
                  aria-label={wishlistIds.includes(product.id) ? t("removeFromWishlist") : t("addToWishlist")}
                  title={wishlistIds.includes(product.id) ? t("removeFromWishlist") : t("addToWishlist")}
                  onClick={() => toggleHomepageWishlist(product.id)}
                ><Icon name="heart" size={18} /></button>
                <div className={styles.productInfo}><Link href={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link><strong>{money(Number(product.price), locale)}</strong>{product.compare_at_price != null && product.compare_at_price > product.price && <del>{money(Number(product.compare_at_price), locale)}</del>}<span className={product.stock > 0 ? styles.inStock : styles.outStock}>{product.stock > 0 ? t("inStock") : t("outOfStock")}</span><ProductCardActions productId={product.id} stock={product.stock} onNotice={setCartNotice} /></div>
              </article>
            ))}</div>
          ) : <div className={styles.emptyProducts}>{t("noProducts")} <Link href="/products">{t("viewCatalog")}</Link></div>}
        </section>

      </main>

      <footer className={styles.footer}><Link href="/" className={styles.brand}><svg viewBox="0 0 148 30" role="img" aria-label="neweix" focusable="false"><text x="0" y="23" >neweix</text></svg></Link><p>{t("footerTagline")}</p><nav aria-label="Footer"><Link href="/about">{t("about")}</Link><Link href="/contact">{t("contact")}</Link><Link href="/faq">{t("faq")}</Link><Link href="/privacy">{t("privacy")}</Link><Link href="/terms">{t("terms")}</Link></nav><small>© {new Date().getFullYear()} NEWEIX. {t("allRights")}</small></footer>



    </div>
  );
}
