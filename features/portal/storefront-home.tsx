"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";
import styles from "./storefront-home.module.css";
import HomepageYouTubeVideos from "@/features/portal/homepage-youtube-videos";
import ProductCardActions from "@/features/products/product-card-actions";
import LanguageSwitcher from "@/components/language-switcher";
import { useLanguage } from "@/components/language-provider";

type Product = {
  id: string; name: string; slug: string; price: number;
  compare_at_price?: number | null; image_urls: string[] | null;
  stock: number; is_featured?: boolean; category_id?: string | null;
};
type Customer = { name: string; email: string };
type Category = { id: string; name: string; slug: string };

function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);
}
function readCount(key: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.length : 0;
  } catch { return 0; }
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
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [cartNotice, setCartNotice] = useState("");
  const panelRef = useRef<HTMLElement>(null);

  const refreshCounts = useCallback(() => {
    setCartCount(readCartCount());
    setWishlistCount(readCount("neweix_wishlist"));
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
    async function loadCustomer() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) { setCustomer(null); return; }
        const { data: profile } = await supabase.from("customer_profiles").select("full_name").eq("user_id", user.id).maybeSingle();
        if (!active) return;
        const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
        setCustomer({ name: profile?.full_name || metadataName || "Valued customer", email: user.email ?? "" });
      } catch { if (active) setCustomer(null); }
    }
    void loadCustomer();
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      try {
        const [productResponse, categoryResponse] = await Promise.all([
          fetch("/api/products", { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" }),
        ]);
        const [productResult, categoryResult] = await Promise.all([
          productResponse.json(),
          categoryResponse.json(),
        ]);
        if (!productResponse.ok || !Array.isArray(productResult.data)) throw new Error("Products unavailable");
        if (active) setProducts(productResult.data.slice(0, 8));
        if (categoryResponse.ok && Array.isArray(categoryResult.categories) && active) {
          const validCategories = categoryResult.categories.filter((item: unknown): item is Category =>
            Boolean(item) && typeof item === "object" &&
            typeof (item as Category).id === "string" &&
            typeof (item as Category).name === "string" &&
            typeof (item as Category).slug === "string"
          );
          const populatedCategories = validCategories.filter((category: Category) =>
            productResult.data.some((product: { category_id?: string | null }) => product.category_id === category.id)
          );
          setCategories(populatedCategories);
        }
      } catch { if (active) setProducts([]); }
      finally { if (active) setProductsLoading(false); }
    }
    void loadProducts();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") { setDrawerOpen(false); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'));
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, [drawerOpen]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim();
    router.push(term ? `/products?search=${encodeURIComponent(term)}` : "/products");
  }


  async function logout() {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setCustomer(null);
      setDrawerOpen(false);
      router.refresh();
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="NEWEIX home"><svg viewBox="0 0 148 30" role="img" aria-label="neweix" focusable="false"><text x="0" y="23" >neweix</text></svg></Link>
        <form className={styles.headerSearch} onSubmit={submitSearch} role="search">
          <label className={styles.srOnly} htmlFor="home-product-search">{t("searchProducts")}</label>
          <input id="home-product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchProducts")} />
          <button type="submit" aria-label={t("search")}><Icon name="search" size={19} /></button>
        </form>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          <Link href="/products">{t("products")}</Link>
          <Link href="/track-order">{t("trackOrder")}</Link>
          <Link href="/wishlist">{t("wishlist")}</Link>
          <Link href="/cart" className={styles.cartLink}>{t("cart")} <span>{cartCount}</span></Link>
        </nav>
        <LanguageSwitcher />
      </header>

      <main className={styles.main}>
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
          {productsLoading ? <p className={styles.state} role="status">{t("loadingProducts")}</p> : products.length ? (
            <div className={styles.productGrid}>{products.map((product) => (
              <article className={styles.productCard} key={product.id}>
                <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.productImage}>
                  {product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name} loading="lazy"/> : <Icon name="package" size={42} />}
                  {product.is_featured && <small>{t("featured")}</small>}
                </Link>
                <div className={styles.productInfo}><Link href={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link><strong>{money(Number(product.price))}</strong>{product.compare_at_price != null && product.compare_at_price > product.price && <del>{money(Number(product.compare_at_price))}</del>}<span className={product.stock > 0 ? styles.inStock : styles.outStock}>{product.stock > 0 ? t("inStock") : t("outOfStock")}</span><ProductCardActions productId={product.id} stock={product.stock} onNotice={setCartNotice} /></div>
              </article>
            ))}</div>
          ) : <div className={styles.emptyProducts}>{t("noProducts")} <Link href="/products">{t("viewCatalog")}</Link></div>}
        </section>

      </main>

      <footer className={styles.footer}><Link href="/" className={styles.brand}><svg viewBox="0 0 148 30" role="img" aria-label="neweix" focusable="false"><text x="0" y="23" >neweix</text></svg></Link><p>{t("footerTagline")}</p><nav aria-label="Footer"><Link href="/about">{t("about")}</Link><Link href="/contact">{t("contact")}</Link><Link href="/faq">{t("faq")}</Link><Link href="/privacy">{t("privacy")}</Link><Link href="/terms">{t("terms")}</Link></nav><small>© {new Date().getFullYear()} NEWEIX. {t("allRights")}</small></footer>

      <nav className={styles.bottomNav} aria-label="Mobile navigation">
        <Link href="/" aria-current="page"><Icon name="home" size={24} />{t("homeNav")}</Link>
        <Link href="/products"><Icon name="grid" size={24} />{t("productsSearch")}</Link>
        <Link href="/cart"><span className={styles.bottomCartIcon}><Icon name="cart" size={24} /><b>{cartCount > 99 ? "99+" : cartCount}</b></span>{t("cart")}</Link>
        <Link href="/account" onClick={(event) => { event.preventDefault(); setDrawerOpen(true); }} aria-haspopup="dialog" aria-expanded={drawerOpen}><Icon name="user" size={24} />{t("myAccountNav")}</Link>
      </nav>

      {drawerOpen && <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
        <aside ref={panelRef} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1}>
          <div className={styles.drawerHead}><div><span className={styles.eyebrow}>{t("customer")}</span><h2 id="drawer-title">{t("myAccount")}</h2></div><button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><Icon name="close" size={18} /></button></div>
          <div className={styles.drawerGroup}>{customer ? <Link href="/account" onClick={() => setDrawerOpen(false)}><Icon name="user" size={17} /> <span>{t("myProfile")}</span></Link> : <Link href="/auth/customer-login?next=/account" onClick={() => setDrawerOpen(false)}><Icon name="user" size={17} /> <span>{t("loginSignup")}</span></Link>}</div>
          <div className={styles.drawerGroup}><span>{t("myShopping")}</span><Link href="/orders" onClick={() => setDrawerOpen(false)}><Icon name="orders" size={17} /> <span>{t("myOrders")}</span></Link><Link href="/track-order" onClick={() => setDrawerOpen(false)}><Icon name="truck" size={17} /> <span>{t("trackMyOrder")}</span></Link><Link href="/wishlist" onClick={() => setDrawerOpen(false)}><Icon name="heart" size={17} /> <span>{t("wishlist")}</span><b>{wishlistCount}</b></Link><Link href="/cart" onClick={() => setDrawerOpen(false)}><Icon name="cart" size={17} /> <span>{t("shoppingCart")}</span><b>{cartCount}</b></Link></div>
          <div className={styles.drawerGroup}><span>{t("accountSettings")}</span><Link href="/account/eixpay" onClick={() => setDrawerOpen(false)}><Icon name="wallet" size={17} /> <span>EixPay Wallet · Eixon</span></Link><Link href="/account/neweix-plus" onClick={() => setDrawerOpen(false)}><Icon name="membership" size={17} /> <span>Neweix+ Membership</span></Link><Link href="/eixverse" onClick={() => setDrawerOpen(false)}><Icon name="globe" size={17} /> <span>EixVerse</span></Link><Link href="/account/theme" onClick={() => setDrawerOpen(false)}><Icon name="settings" size={17} /> <span>{t("themePreferences")}</span></Link>
             <Link href="/account/addresses" onClick={() => setDrawerOpen(false)}><Icon name="map-pin" size={17} /> <span>{t("deliveryAddresses")}</span></Link>
             <Link href="/account/privacy" onClick={() => setDrawerOpen(false)}><Icon name="shield" size={17} /> <span>{t("privacyConsent")}</span></Link>
             <Link href="/account/data-requests" onClick={() => setDrawerOpen(false)}><Icon name="settings" size={17} /> <span>{t("dataControls")}</span></Link></div>
          <div className={styles.drawerGroup}><span>{t("helpSupport")}</span><Link href="/faq" onClick={() => setDrawerOpen(false)}><Icon name="help" size={17} /> <span>{t("faq")}</span></Link><Link href="/contact" onClick={() => setDrawerOpen(false)}><Icon name="mail" size={17} /> <span>{t("contact")}</span></Link></div>
          {customer && <button className={styles.logoutButton} type="button" onClick={() => void logout()}><Icon name="logout" size={17} /> {t("logout")}</button>}
          <p className={styles.drawerFoot}>{t("footerTagline")}</p>
        </aside>
      </div>}
    </div>
  );
}
