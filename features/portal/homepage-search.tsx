"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useLanguage } from "@/components/language-provider";
import styles from "./homepage-search.module.css";

type SearchProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image_urls: string[] | null;
};

type SearchCategory = { name: string; slug: string };

type Props = { categories: SearchCategory[] };

const RECENT_SEARCH_KEY = "neweix_recent_searches";
const MAX_RECENT_SEARCHES = 5;

function readRecentSearches() {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}

function formatPrice(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function HomepageSearch({ categories }: Props) {
  const { locale, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = query.trim();

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  useEffect(() => {
    if (!open || normalizedQuery.length < 2) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: "1", search: normalizedQuery });
        const response = await fetch(`/api/products?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Search suggestions unavailable");
        const result = await response.json() as { data?: SearchProduct[] };
        if (!controller.signal.aborted) {
          setProducts(Array.isArray(result.data) ? result.data.slice(0, 5) : []);
        }
      } catch {
        if (!controller.signal.aborted) setProducts([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, open]);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const matchingCategories = normalizedQuery.length > 0
    ? categories.filter((category) => category.name.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())).slice(0, 3)
    : categories.slice(0, 4);

  function rememberSearch(term: string) {
    const value = term.trim().slice(0, 160);
    if (!value) return;
    const next = [value, ...readRecentSearches().filter((item) => item.toLocaleLowerCase() !== value.toLocaleLowerCase())]
      .slice(0, MAX_RECENT_SEARCHES);
    try {
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      setRecentSearches(next);
    } catch {
      // Search remains usable when browser storage is unavailable.
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    if (!normalizedQuery) {
      event.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
      return;
    }
    rememberSearch(normalizedQuery);
    setOpen(false);
  }

  function chooseRecent(term: string) {
    setQuery(term);
    rememberSearch(term);
    window.location.assign(`/products?search=${encodeURIComponent(term)}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const optionsCount = products.length + matchingCategories.length;
    if (event.key === "ArrowDown" && optionsCount > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % optionsCount);
    } else if (event.key === "ArrowUp" && optionsCount > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? optionsCount - 1 : current - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      const selectedProduct = products[activeIndex];
      const selectedCategory = matchingCategories[activeIndex - products.length];
      if (selectedProduct) {
        event.preventDefault();
        window.location.assign(`/products/${encodeURIComponent(selectedProduct.slug)}`);
      } else if (selectedCategory) {
        event.preventDefault();
        window.location.assign(`/products?category=${encodeURIComponent(selectedCategory.slug)}`);
      }
    }
  }

  return (
    <div ref={rootRef} className={styles.searchRoot}>
      <form className={styles.searchForm} action="/products" method="get" role="search" onSubmit={submitSearch}>
        <span className={styles.searchIcon} aria-hidden="true"><Icon name="search" size={20} /></span>
        <label className={styles.srOnly} htmlFor="neweix-home-search">{t("searchProducts")}</label>
        <input
          ref={inputRef}
          id="neweix-home-search"
          name="search"
          type="search"
          value={query}
          maxLength={160}
          autoComplete="off"
          placeholder={locale === "bn" ? "পণ্য, ব্র্যান্ড বা ক্যাটাগরি খুঁজুন..." : "Search products, brands or categories..."}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="neweix-home-search-suggestions"
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); }}
          onKeyDown={handleKeyDown}
        />
        {query && <button className={styles.clearButton} type="button" aria-label={locale === "bn" ? "মুছে ফেলুন" : "Clear search"} onClick={() => { setQuery(""); setProducts([]); setActiveIndex(-1); inputRef.current?.focus(); }}><Icon name="close" size={16} /></button>}
        <button className={styles.submitButton} type="submit">
          <span>{locale === "bn" ? "খুঁজুন" : "Search"}</span>
          <Icon name="arrow-right" size={17} />
        </button>
      </form>

      {open && <div id="neweix-home-search-suggestions" className={styles.suggestions} role="listbox" aria-label={locale === "bn" ? "সার্চ সাজেশন" : "Search suggestions"}>
        {normalizedQuery.length >= 2 ? (
          <>
            <div className={styles.suggestionHeading}>
              <span>{locale === "bn" ? "পণ্যের সাজেশন" : "PRODUCT SUGGESTIONS"}</span>
              {loading && <span className={styles.loadingText}>{locale === "bn" ? "খোঁজা হচ্ছে..." : "Searching..."}</span>}
            </div>
            {!loading && products.length > 0 && <div className={styles.productSuggestions}>
              {products.map((product, index) => (
                <Link
                  key={product.id}
                  href={`/products/${encodeURIComponent(product.slug)}`}
                  className={styles.productSuggestion}
                  role="option"
                  aria-selected={activeIndex === index}
                  onClick={() => { rememberSearch(normalizedQuery); setOpen(false); }}
                >
                  <span className={styles.productThumb}>
                    {product.image_urls?.[0] ? <img src={product.image_urls[0]} alt="" loading="lazy" /> : <Icon name="package" size={19} />}
                  </span>
                  <span className={styles.productCopy}><strong>{product.name}</strong><small>{formatPrice(Number(product.price), locale)}</small></span>
                  <Icon name="arrow-right" size={16} />
                </Link>
              ))}
            </div>}
            {!loading && products.length === 0 && <p className={styles.noResults}>{locale === "bn" ? "কোনো পণ্য পাওয়া যায়নি। অন্য শব্দ দিয়ে চেষ্টা করুন।" : "No matching products yet. Try another keyword."}</p>}
            {matchingCategories.length > 0 && <div className={styles.categorySuggestions}>
              <span className={styles.suggestionLabel}>{locale === "bn" ? "ক্যাটাগরি" : "CATEGORIES"}</span>
              {matchingCategories.map((category, index) => (
                <Link
                  key={category.slug}
                  href={`/products?category=${encodeURIComponent(category.slug)}`}
                  role="option"
                  aria-selected={activeIndex === products.length + index}
                  onClick={() => setOpen(false)}
                ><span className={styles.categoryDot} />{category.name}<Icon name="arrow-right" size={14} /></Link>
              ))}
            </div>}
            <Link className={styles.allResults} href={`/products?search=${encodeURIComponent(normalizedQuery)}`} onClick={() => { rememberSearch(normalizedQuery); setOpen(false); }}>
              {locale === "bn" ? "সব ফলাফল দেখুন" : "View all search results"} <Icon name="arrow-right" size={15} />
            </Link>
          </>
        ) : (
          <>
            {recentSearches.length > 0 && <div className={styles.recentSuggestions}>
              <div className={styles.suggestionHeading}><span>{locale === "bn" ? "সাম্প্রতিক সার্চ" : "RECENT SEARCHES"}</span><button type="button" onClick={() => { localStorage.removeItem(RECENT_SEARCH_KEY); setRecentSearches([]); }}>{locale === "bn" ? "মুছুন" : "Clear"}</button></div>
              {recentSearches.map((term) => <button type="button" key={term} onClick={() => chooseRecent(term)}><Icon name="clock" size={15} />{term}<Icon name="arrow-right" size={14} /></button>)}
            </div>}
            {matchingCategories.length > 0 && <div className={styles.categorySuggestions}>
              <span className={styles.suggestionLabel}>{locale === "bn" ? "জনপ্রিয় ক্যাটাগরি" : "POPULAR CATEGORIES"}</span>
              {matchingCategories.map((category) => <Link key={category.slug} href={`/products?category=${encodeURIComponent(category.slug)}`} onClick={() => setOpen(false)}><span className={styles.categoryDot} />{category.name}<Icon name="arrow-right" size={14} /></Link>)}
            </div>}
            {recentSearches.length === 0 && matchingCategories.length === 0 && <p className={styles.noResults}>{locale === "bn" ? "পণ্য খুঁজতে টাইপ করা শুরু করুন।" : "Start typing to discover products."}</p>}
          </>
        )}
      </div>}
    </div>
  );
}
