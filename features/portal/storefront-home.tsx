"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";
import styles from "./storefront-home.module.css";

type Product = {
  id: string; name: string; slug: string; price: number;
  compare_at_price?: number | null; image_urls: string[] | null;
  stock: number; is_featured?: boolean; category_id?: string | null;
};
type Customer = { name: string; email: string };
type Category = { id: string; name: string; slug: string };

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);
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
        setCustomer({ name: profile?.full_name || metadataName || "প্রিয় গ্রাহক", email: user.email ?? "" });
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

  function addToCart(product: Product) {
    if (!Number.isSafeInteger(Number(product.stock)) || Number(product.stock) < 1) {
      setCartNotice("পণ্যটি বর্তমানে স্টকে নেই।");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem("neweix_cart") ?? "[]");
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");
      const quantities = new Map<string, number>();
      for (const value of parsed) {
        if (!value || typeof value !== "object") continue;
        const item = value as Record<string, unknown>;
        if (typeof item.product_id !== "string" || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1) continue;
        quantities.set(item.product_id, Math.min(100, (quantities.get(item.product_id) ?? 0) + Number(item.quantity)));
      }
      const current = quantities.get(product.id) ?? 0;
      if (current >= Math.min(100, Number(product.stock))) {
        setCartNotice("স্টকে থাকা সর্বোচ্চ পরিমাণ ইতিমধ্যে কার্টে আছে।");
        return;
      }
      quantities.set(product.id, current + 1);
      localStorage.setItem("neweix_cart", JSON.stringify(Array.from(quantities, ([product_id, quantity]) => ({ product_id, quantity }))));
      window.dispatchEvent(new Event("neweix-cart-change"));
      setCartNotice("পণ্যটি কার্টে যোগ হয়েছে।");
    } catch {
      setCartNotice("কার্ট আপডেট করা যায়নি। আবার চেষ্টা করুন।");
    }
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
        <Link href="/" className={styles.brand} aria-label="neweix হোম"><svg viewBox="0 0 148 30" role="img" aria-label="neweix" focusable="false"><text x="0" y="23" >neweix</text></svg></Link>
        <form className={styles.headerSearch} onSubmit={submitSearch} role="search">
          <label className={styles.srOnly} htmlFor="home-product-search">পণ্য খুঁজুন</label>
          <input id="home-product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="কোন পণ্য খুঁজছেন?" />
          <button type="submit" aria-label="খুঁজুন"><Icon name="search" size={19} /></button>
        </form>
        <nav className={styles.desktopNav} aria-label="প্রধান নেভিগেশন">
          <Link href="/products">সব পণ্য</Link>
          <Link href="/track-order">অর্ডার ট্র্যাক</Link>
          <Link href="/wishlist">পছন্দের তালিকা</Link>
          <Link href="/cart" className={styles.cartLink}>কার্ট <span>{cartCount}</span></Link>
        </nav>
      </header>

      <main className={styles.main}>
        {categories.length > 0 && <section className={styles.categorySection} aria-labelledby="category-title">
          <div className={styles.categoryHeading}><div><span className={styles.eyebrow}>SHOP BY CATEGORY</span><h2 id="category-title">ক্যাটাগরি অনুযায়ী পণ্য</h2></div><Link href="/products">সব ক্যাটাগরি <Icon name="arrow-right" size={16} /></Link></div>
          <div className={styles.categoryList}>
            {categories.map((category) => <Link key={category.id} href={`/products?category=${encodeURIComponent(category.slug)}`}>{category.name}<Icon name="arrow-right" size={15} /></Link>)}
          </div>
        </section>}

        <section className={styles.productSection} aria-labelledby="featured-title">
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>DISCOVER NEWEIX</span><h2 id="featured-title">আপনার জন্য পণ্য</h2><p>স্টোরে বর্তমানে থাকা পণ্য থেকে বেছে নিন।</p></div><Link href="/products">সব পণ্য দেখুন <Icon name="arrow-right" size={16} /></Link></div>
          {cartNotice && <p className={styles.cartNotice} role="status">{cartNotice}<button type="button" onClick={() => setCartNotice("")} aria-label="বার্তা বন্ধ করুন"><Icon name="close" size={17} /></button></p>}
          {productsLoading ? <p className={styles.state} role="status">পণ্য লোড হচ্ছে…</p> : products.length ? (
            <div className={styles.productGrid}>{products.map((product) => (
              <article className={styles.productCard} key={product.id}>
                <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.productImage}>
                  {product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name} loading="lazy"/> : <Icon name="package" size={42} />}
                  {product.is_featured && <small>বিশেষ পণ্য</small>}
                </Link>
                <div className={styles.productInfo}><Link href={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link><strong>{money(Number(product.price))}</strong>{product.compare_at_price != null && product.compare_at_price > product.price && <del>{money(Number(product.compare_at_price))}</del>}<span className={product.stock > 0 ? styles.inStock : styles.outStock}>{product.stock > 0 ? "স্টকে আছে" : "স্টক শেষ"}</span><button type="button" disabled={product.stock < 1} onClick={() => addToCart(product)} className={styles.addToCart}><Icon name="plus" size={17} /> কার্টে যোগ করুন</button></div>
              </article>
            ))}</div>
          ) : <div className={styles.emptyProducts}>এখনো প্রদর্শনের মতো পণ্য পাওয়া যায়নি। <Link href="/products">ক্যাটালগ দেখুন</Link></div>}
        </section>

      </main>

      <footer className={styles.footer}><Link href="/" className={styles.brand}><svg viewBox="0 0 148 30" role="img" aria-label="neweix" focusable="false"><text x="0" y="23" >neweix</text></svg></Link><p>স্মার্ট কেনাকাটা, আরও সুন্দর অভিজ্ঞতা।</p><nav aria-label="ফুটার"><Link href="/about">আমাদের সম্পর্কে</Link><Link href="/contact">যোগাযোগ</Link><Link href="/faq">সাধারণ জিজ্ঞাসা</Link><Link href="/privacy">গোপনীয়তা</Link><Link href="/terms">শর্তাবলি</Link></nav><small>© {new Date().getFullYear()} NEWEIX. সর্বস্বত্ব সংরক্ষিত।</small></footer>

      <nav className={styles.bottomNav} aria-label="মোবাইল নেভিগেশন">
        <Link href="/" aria-current="page"><Icon name="home" size={24} />হোম</Link>
        <Link href="/products"><Icon name="grid" size={24} />পণ্য ও সার্চ</Link>
        <Link href="/cart"><span className={styles.bottomCartIcon}><Icon name="cart" size={24} /><b>{cartCount > 99 ? "99+" : cartCount}</b></span>কার্ট</Link>
        <Link href="/account" onClick={(event) => { event.preventDefault(); setDrawerOpen(true); }} aria-haspopup="dialog" aria-expanded={drawerOpen}><Icon name="user" size={24} />মাই অ্যাকাউন্ট</Link>
      </nav>

      {drawerOpen && <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
        <aside ref={panelRef} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1}>
          <div className={styles.drawerHead}><div><span className={styles.eyebrow}>NEWEIX CUSTOMER</span><h2 id="drawer-title">মাই অ্যাকাউন্ট</h2></div><button type="button" onClick={() => setDrawerOpen(false)} aria-label="মেনু বন্ধ করুন"><Icon name="close" size={18} /></button></div>
          <div className={styles.drawerGroup}>{customer ? <Link href="/account" onClick={() => setDrawerOpen(false)}><Icon name="user" size={17} /> <span>প্রোফাইল</span></Link> : <Link href="/auth/customer-login?next=/account" onClick={() => setDrawerOpen(false)}><Icon name="user" size={17} /> <span>লগইন বা সাইনআপ</span></Link>}</div>
          <div className={styles.drawerGroup}><span>আমার কেনাকাটা</span><Link href="/orders" onClick={() => setDrawerOpen(false)}><Icon name="orders" size={17} /> <span>আমার অর্ডার</span></Link><Link href="/track-order" onClick={() => setDrawerOpen(false)}><Icon name="truck" size={17} /> <span>অর্ডার ট্র্যাক করুন</span></Link><Link href="/wishlist" onClick={() => setDrawerOpen(false)}><Icon name="heart" size={17} /> <span>পছন্দের তালিকা</span><b>{wishlistCount}</b></Link><Link href="/cart" onClick={() => setDrawerOpen(false)}><Icon name="cart" size={17} /> <span>শপিং কার্ট</span><b>{cartCount}</b></Link></div>
          <div className={styles.drawerGroup}><span>আমার অ্যাকাউন্ট</span><Link href="/account/eixpay" onClick={() => setDrawerOpen(false)}><Icon name="wallet" size={17} /> <span>EixPay Wallet · Eixon</span></Link><Link href="/account/neweix-plus" onClick={() => setDrawerOpen(false)}><Icon name="membership" size={17} /> <span>Neweix+ Membership</span></Link><Link href="/eixverse" onClick={() => setDrawerOpen(false)}><Icon name="globe" size={17} /> <span>EixVerse</span></Link><Link href="/account/theme" onClick={() => setDrawerOpen(false)}><Icon name="settings" size={17} /> <span>থিম ও পছন্দ</span></Link>
             <Link href="/account/addresses" onClick={() => setDrawerOpen(false)}><Icon name="map-pin" size={17} /> <span>ডেলিভারি ঠিকানা</span></Link>
             <Link href="/account/privacy" onClick={() => setDrawerOpen(false)}><Icon name="shield" size={17} /> <span>গোপনীয়তা ও সম্মতি</span></Link>
             <Link href="/account/data-requests" onClick={() => setDrawerOpen(false)}><Icon name="settings" size={17} /> <span>আমার তথ্য নিয়ন্ত্রণ</span></Link></div>
          <div className={styles.drawerGroup}><span>সাহায্য ও সহায়তা</span><Link href="/faq" onClick={() => setDrawerOpen(false)}><Icon name="help" size={17} /> <span>সাধারণ জিজ্ঞাসা</span></Link><Link href="/contact" onClick={() => setDrawerOpen(false)}><Icon name="mail" size={17} /> <span>যোগাযোগ</span></Link></div>
          {customer && <button className={styles.logoutButton} type="button" onClick={() => void logout()}><Icon name="logout" size={17} /> লগআউট</button>}
          <p className={styles.drawerFoot}>আপনার কেনাকাটা, আপনার নিয়ন্ত্রণে।</p>
        </aside>
      </div>}
    </div>
  );
}
