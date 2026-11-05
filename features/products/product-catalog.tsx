"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import styles from "./product-catalog.module.css";
import ProductCardActions from "@/features/products/product-card-actions";
import { useLanguage } from "@/components/language-provider";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price?: number | null;
  image_urls: string[] | null;
  stock: number;
  category_id?: string | null;
  is_featured?: boolean;
};

type Category = { id: string; name: string; slug: string };
type ApiResponse = { data?: Product[]; hasMore?: boolean; page?: number };

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ProductCatalog() {
  const { t, locale } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"featured" | "price-asc" | "price-desc">("featured");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySlug, setCategorySlug] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState(2);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const visibleCategories = useMemo(
    () => categories.filter((category) => products.some((product) => product.category_id === category.id)),
    [categories, products]
  );

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/products?page=1", { cache: "no-store" });
      if (!response.ok) throw new Error("Product request failed");
      const result = (await response.json()) as ApiResponse;
      if (!Array.isArray(result.data)) throw new Error("Invalid product response");
      setProducts(result.data.slice(0, 20));
      setHasMore(result.hasMore === true);
      setNextPage(2);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreProducts = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/products?page=${nextPage}`, { cache: "no-store" });
      if (!response.ok) throw new Error("More products request failed");
      const result = (await response.json()) as ApiResponse;
      if (!Array.isArray(result.data)) throw new Error("Invalid product response");
      setProducts((current) => {
        const knownIds = new Set(current.map((product) => product.id));
        return [...current, ...result.data!.filter((product) => !knownIds.has(product.id))];
      });
      setHasMore(result.hasMore === true);
      setNextPage((current) => current + 1);
    } catch {
      setNotice("Could not load more products. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextPage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get("search") ?? "");
    const requestedSort = params.get("sort");
    if (requestedSort === "featured" || requestedSort === "price-asc" || requestedSort === "price-desc") setSort(requestedSort);
    setCategorySlug(params.get("category") ?? "");
    setMinPrice(params.get("minPrice") ?? "");
    setMaxPrice(params.get("maxPrice") ?? "");
    setInStockOnly(params.get("inStock") === "1");
    void loadProducts();
    fetch("/api/categories", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.categories)) return;
        setCategories(result.categories.filter((item: unknown): item is Category =>
          Boolean(item) && typeof item === "object" &&
          typeof (item as Category).id === "string" &&
          typeof (item as Category).name === "string" &&
          typeof (item as Category).slug === "string"
        ));
      })
      .catch(() => setCategories([]));
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("neweix_wishlist") ?? "[]");
      if (Array.isArray(saved)) setWishlist(Array.from(new Set(saved.filter((id): id is string => typeof id === "string"))).slice(0, 200));
      const compared: unknown = JSON.parse(localStorage.getItem("neweix_compare") ?? "[]");
      if (Array.isArray(compared)) setCompareIds(Array.from(new Set(compared.filter((id): id is string => typeof id === "string"))).slice(0, 4));
    } catch {
      localStorage.removeItem("neweix_wishlist");
    }
  }, [loadProducts]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const selectedCategory = categories.find((category) => category.slug === categorySlug);
    const categoryMatches = !categorySlug
      ? products
      : selectedCategory
        ? products.filter((product) => product.category_id === selectedCategory.id)
        : [];
    const minimum = minPrice.trim() ? Number(minPrice) : null;
    const maximum = maxPrice.trim() ? Number(maxPrice) : null;
    const matches = categoryMatches.filter((product) => {
      const textMatches = !term || [product.name, product.description ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(term)
      );
      const price = Number(product.price);
      const minimumMatches = minimum === null || !Number.isFinite(minimum) || price >= minimum;
      const maximumMatches = maximum === null || !Number.isFinite(maximum) || price <= maximum;
      const stockMatches = !inStockOnly || Number(product.stock) > 0;
      return textMatches && minimumMatches && maximumMatches && stockMatches;
    });
    if (sort === "price-asc") matches.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-desc") matches.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "featured") matches.sort((a, b) => Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured)));
    return matches;
  }, [products, query, sort, categories, categorySlug, minPrice, maxPrice, inStockOnly]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    const term = query.trim().slice(0, 160);
    if (term) params.set("search", term);
    if (categorySlug) params.set("category", categorySlug);
    if (minPrice.trim()) params.set("minPrice", minPrice.trim());
    if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
    if (inStockOnly) params.set("inStock", "1");
    if (sort !== "featured") params.set("sort", sort);
    const nextUrl = params.size ? `/products?${params.toString()}` : "/products";
    window.history.replaceState(null, "", nextUrl);
  }

  function toggleWishlist(product: Product) {
    const next = wishlist.includes(product.id) ? wishlist.filter((id) => id !== product.id) : [...wishlist, product.id].slice(-200);
    try {
      localStorage.setItem("neweix_wishlist", JSON.stringify(next));
      window.dispatchEvent(new Event("neweix-wishlist-change"));
      setWishlist(next);
      setNotice(next.includes(product.id) ? t("savedToWishlist") : t("removedFromWishlist"));
    } catch {
      setNotice(t("wishlistSaveFailed"));
    }
  }

  function toggleCompare(product: Product) {
    const next = compareIds.includes(product.id) ? compareIds.filter((id) => id !== product.id) : compareIds.length < 4 ? [...compareIds, product.id] : null;
    if (!next) { setNotice(t("compareLimit")); return; }
    try { localStorage.setItem("neweix_compare", JSON.stringify(next)); setCompareIds(next); setNotice(next.includes(product.id) ? t("addedToCompare") : t("removedFromCompare")); window.dispatchEvent(new Event("neweix-compare-change")); }
    catch { setNotice(t("compareSaveFailed")); }
  }


  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>NEWEIX</Link>
        <nav aria-label="Main navigation">
          <Link href="/search"><Icon name="search" size={16} /> AI Search</Link>
          <Link href="/track-order"><Icon name="truck" size={16} /> {t("trackOrder")}</Link>
          <Link href="/account"><Icon name="user" size={16} /> {t("myAccount")}</Link>
          <Link href="/wishlist"><Icon name="heart" size={16} /> {t("wishlist")} ({wishlist.length})</Link>
          <Link href="/compare"><Icon name="compare" size={16} /> {t("compare")} ({compareIds.length})</Link>
          <Link href="/cart"><Icon name="cart" size={16} /> {t("cart")}</Link>
        </nav>
      </header>

      <section className={styles.intro} aria-labelledby="catalog-title">
        <span className={styles.eyebrow}>NEWEIX COLLECTION</span>
        <h1 id="catalog-title">{t("discoverProducts")}</h1>
        <p>{t("findFavorites")}</p>
        <form className={styles.searchForm} role="search" onSubmit={submitSearch}>
          <label className={styles.search} htmlFor="catalog-product-search">
            <Icon name="search" size={18} />
            <span className={styles.srOnly}>{t("searchProducts")}</span>
            <input
              id="catalog-product-search"
              type="search"
              value={query}
              maxLength={160}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("productNameSku")}
            />
          </label>
          <button className={styles.searchSubmit} type="submit" disabled={!query.trim()}>
            <Icon name="search" size={17} /> {t("search")}
          </button>
        </form>
        {visibleCategories.length > 0 && <label className={styles.search} style={{ marginTop: 12 }}>
          <span className={styles.srOnly}>{t("allCategories")}</span>
          <select aria-label={t("allCategories")} value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)}>
            <option value="">{t("allCategories")}</option>
            {visibleCategories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
          </select>
        </label>}
        {visibleCategories.length > 0 && <div className={styles.categoryChips} aria-label="Quick categories">
          <button type="button" aria-pressed={!categorySlug} className={!categorySlug ? styles.activeChip : ""} onClick={() => setCategorySlug("")}><Icon name="grid" size={14} /> {t("allProducts")}</button>
          {visibleCategories.map((category) => <button key={category.id} type="button" aria-pressed={categorySlug === category.slug} className={categorySlug === category.slug ? styles.activeChip : ""} onClick={() => setCategorySlug(category.slug)}><Icon name="tag" size={14} /> {category.name}</button>)}
        </div>}
        <div className={styles.filterPanel}>
        <div className={styles.filterHeading}><strong>{t("sortProducts")}</strong><span>{products.length}{hasMore ? "+" : ""} {t("resultsFound")}</span></div>
        <div className={styles.filterRow}>
          <label className={styles.priceField}>{t("minPrice")}
            <input aria-label={t("minPrice")} type="number" min="0" inputMode="numeric" placeholder="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} />
          </label>
          <label className={styles.priceField}>{t("maxPrice")}
            <input aria-label={t("maxPrice")} type="number" min="0" inputMode="numeric" placeholder="10,000" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
          </label>
          <label className={styles.stockFilter}><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} /> {t("onlyInStock")}</label>
          <button type="button" className={styles.clearFilters} onClick={() => { setQuery(""); setCategorySlug(""); setMinPrice(""); setMaxPrice(""); setInStockOnly(false); setSort("featured"); window.history.replaceState(null, "", "/products"); }}><Icon name="close" size={15} /> {t("clearFilters")}</button>
        </div>
        <label className={styles.sortControl}>
          <span className={styles.srOnly}>{t("sortProducts")}</span>
          <select aria-label={t("sortProducts")} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="featured">{t("featuredFirst")}</option>
            <option value="price-asc">{t("priceLowHigh")}</option>
            <option value="price-desc">{t("priceHighLow")}</option>
          </select>
        </label>
        </div>
        <p className={styles.resultSummary} aria-live="polite">{categories.find((category) => category.slug === categorySlug)?.name ? `${categories.find((category) => category.slug === categorySlug)?.name} · ` : ""}{filtered.length}{t("resultsFound")} · {products.length}{hasMore ? "+" : ""} loaded</p>
      </section>

      <section className={styles.catalog} aria-label="Product list">
        {notice && (
          <div className={styles.notice} role="status">
            {notice}
            <button type="button" onClick={() => setNotice("")} aria-label={t("closeMessage")} title={t("closeMessage")}><Icon name="close" size={17} /></button>
          </div>
        )}
        {loading && <p className={styles.state}>{t("loadingProducts")}</p>}
        {!loading && error && (
          <div className={styles.state}>
            <p>{t("productLoadError")}</p>
            <button type="button" onClick={() => void loadProducts()}><Icon name="refresh" size={16} /> {t("retry")}</button>
          </div>
        )}
        {!loading && !error && products.length === 0 && (
          <p className={styles.state}>{t("noProducts")}</p>
        )}
        {!loading && !error && products.length > 0 && filtered.length === 0 && (
          <p className={styles.state}>{t("noMatchingProducts")}</p>
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
                {product.is_featured && <small>{t("featured")}</small>}
              </Link>
              <div className={styles.details}>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button type="button" aria-pressed={wishlist.includes(product.id)} aria-label={wishlist.includes(product.id) ? t("removeFromWishlist") : t("addToWishlist")} title={wishlist.includes(product.id) ? t("removeFromWishlist") : t("addToWishlist")} onClick={() => toggleWishlist(product)} className={styles.iconButton} style={{ borderColor: "var(--border)" }}><Icon name="heart" size={17} /></button>
                  <button type="button" aria-pressed={compareIds.includes(product.id)} aria-label={compareIds.includes(product.id) ? t("removedFromCompare") : t("compare")} title={compareIds.includes(product.id) ? t("removedFromCompare") : t("compare")} onClick={() => toggleCompare(product)} className={styles.iconButton} style={{ borderColor: "var(--border)" }}><Icon name="compare" size={17} /></button>
                </div>
                <span className={product.stock > 0 ? styles.inStock : styles.outOfStock}>
                  {product.stock > 0 ? t("inStock") : t("outOfStock")}
                </span>
                <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.name}>
                  {product.name}
                </Link>
                {product.description && <p>{product.description}</p>}
                <div className={styles.bottom}>
                  <div>
                    <strong>{money(Number(product.price), locale)}</strong>
                    {product.compare_at_price != null && product.compare_at_price > product.price && (
                      <del>{money(Number(product.compare_at_price), locale)}</del>
                    )}
                  </div>
                  <ProductCardActions productId={product.id} stock={product.stock} onNotice={setNotice} />
                </div>
              </div>
            </article>
          ))}
        </div>
        {!loading && !error && hasMore && (
          <div className={styles.state}>
            <button type="button" onClick={() => void loadMoreProducts()} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load 20 more products"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
