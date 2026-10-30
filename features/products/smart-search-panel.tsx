"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_urls: string[] | null;
  stock: number;
  sku: string | null;
  relevance_score?: number;
};
type Category = { id: string; name: string; slug: string };
type SearchResponse = { data?: Product[]; ai?: { used?: boolean; mode?: string }; error?: string };
type Suggestion = { id: string; name: string; slug: string; price: number; image: string | null };

const PAGE_SIZE = 24;
const FETCH_SIZE = PAGE_SIZE + 1;

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function SmartSearchPanel() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState("relevance");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const executeSearch = useCallback(async (term: string, targetPage = 1) => {
    const normalized = term.trim().slice(0, 160);
    if (!normalized) {
      abortRef.current?.abort();
      setProducts([]);
      setSubmitted(false);
      setPage(1);
      setError("");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    setSubmitted(true);
    setPage(targetPage);

    try {
      const params = new URLSearchParams({
        q: normalized,
        limit: String(FETCH_SIZE),
        page: String(targetPage),
        sort,
      });
      if (categoryId) params.set("categoryId", categoryId);
      if (minPrice.trim()) params.set("minPrice", minPrice.trim());
      if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
      if (inStock) params.set("inStock", "true");

      const response = await fetch("/api/search?" + params.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });
      const result = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(result.error || "সার্চ করা যায়নি।");
      const rows = Array.isArray(result.data) ? result.data : [];
      setHasMore(rows.length > PAGE_SIZE);
      setProducts(rows.slice(0, PAGE_SIZE));
      setAiUsed(Boolean(result.ai?.used));
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "সার্চ করা যায়নি।");
      setProducts([]);
      setHasMore(false);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [categoryId, inStock, maxPrice, minPrice, sort]);
  const executeSearchRef = useRef(executeSearch);

  function runSearch(event?: FormEvent) {
    event?.preventDefault();
    void executeSearch(query, 1);
  }

  useEffect(() => {
    executeSearchRef.current = executeSearch;
  }, [executeSearch]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/categories", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Categories unavailable");
        const result = (await response.json()) as { categories?: unknown };
        if (!Array.isArray(result.categories)) return;
        setCategories(result.categories.filter((item): item is Category =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as Category).id === "string" &&
          typeof (item as Category).name === "string" &&
          typeof (item as Category).slug === "string"
        ));
      })
      .catch(() => {
        if (!controller.signal.aborted) setCategories([]);
      });

    const initialQuery = new URLSearchParams(window.location.search)
      .get("search")
      ?.trim()
      .slice(0, 160);
    if (initialQuery) {
      setQuery(initialQuery);
      void executeSearchRef.current(initialQuery, 1);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/search/suggestions?q=" + encodeURIComponent(term), {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((result: { suggestions?: Suggestion[] }) => {
          setSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestions([]);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function clearFilters() {
    setCategoryId("");
    setMinPrice("");
    setMaxPrice("");
    setInStock(false);
    setSort("relevance");
    setPage(1);
  }

  return (
    <section
      aria-labelledby="smart-search-title"
      style={{
        width: "min(1160px, calc(100% - 32px))",
        margin: "32px auto",
        padding: 20,
        border: "1px solid var(--border, #d8dfd8)",
        borderRadius: 16,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>
          NEWEIX SMART SEARCH
        </p>
        <h2 id="smart-search-title" style={{ margin: "6px 0", fontSize: 24 }}>
          AI দিয়ে পণ্য খুঁজুন
        </h2>
        <p style={{ margin: 0, opacity: 0.75 }}>
          পণ্যের নাম, SKU অথবা নিজের প্রয়োজন বাংলায়, ইংরেজিতে বা Banglish-এ লিখুন।
        </p>
      </div>

      <form onSubmit={runSearch} role="search">
        <label htmlFor="neweix-ai-search" className="sr-only">পণ্য খুঁজুন</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            id="neweix-ai-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="যেমন: কালো টি-শার্ট, T shirt বা SKU"
            maxLength={160}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls="neweix-search-suggestions"
            style={{
              flex: "1 1 260px",
              minHeight: 46,
              padding: "10px 14px",
              border: "1px solid var(--border, #cbd5cb)",
              borderRadius: 10,
            }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              minHeight: 46,
              padding: "10px 20px",
              borderRadius: 10,
              fontWeight: 800,
              background: "var(--primary, #c4f36b)",
              color: "#14200e",
            }}
          >
            {loading ? "খুঁজছে…" : "খুঁজুন"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <select
            aria-label="ক্যাটাগরি নির্বাচন করুন"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            style={{ minHeight: 38, padding: 7, border: "1px solid var(--border, #cbd5cb)", borderRadius: 8 }}
          >
            <option value="">সব ক্যাটাগরি</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <input
            aria-label="সর্বনিম্ন দাম"
            type="number"
            min="0"
            max="1000000000"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            placeholder="সর্বনিম্ন দাম"
            style={{ width: 130, minHeight: 38, padding: 8, border: "1px solid var(--border, #cbd5cb)", borderRadius: 8 }}
          />
          <input
            aria-label="সর্বোচ্চ দাম"
            type="number"
            min="0"
            max="1000000000"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            placeholder="সর্বোচ্চ দাম"
            style={{ width: 130, minHeight: 38, padding: 8, border: "1px solid var(--border, #cbd5cb)", borderRadius: 8 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={inStock} onChange={(event) => setInStock(event.target.checked)} />
            শুধু স্টকে আছে
          </label>
          <select
            aria-label="ফলাফল সাজান"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            style={{ minHeight: 38, padding: 7, border: "1px solid var(--border, #cbd5cb)", borderRadius: 8 }}
          >
            <option value="relevance">প্রাসঙ্গিকতা</option>
            <option value="price_asc">দাম: কম থেকে বেশি</option>
            <option value="price_desc">দাম: বেশি থেকে কম</option>
            <option value="newest">নতুন পণ্য</option>
          </select>
          <button type="button" onClick={clearFilters}>ফিল্টার রিসেট</button>
        </div>
      </form>

      {suggestions.length > 0 && !loading && (
        <ul
          id="neweix-search-suggestions"
          role="listbox"
          aria-label="পণ্যের সাজেশন"
          style={{ listStyle: "none", padding: 8, margin: "8px 0", border: "1px solid var(--border, #d8dfd8)", borderRadius: 10 }}
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <Link
                role="option"
                href={"/products/" + encodeURIComponent(suggestion.slug)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, textDecoration: "none" }}
              >
                {suggestion.image ? (
                  <img src={suggestion.image} alt="" width="40" height="40" style={{ objectFit: "cover", borderRadius: 6 }} />
                ) : null}
                <span style={{ flex: 1 }}>{suggestion.name}</span>
                <small>{money(suggestion.price)}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {submitted && (
        <p role="status" aria-live="polite" style={{ margin: "14px 0 8px", fontSize: 13 }}>
          {loading ? "পণ্য খোঁজা হচ্ছে…" : error || products.length + "টি পণ্য পাওয়া গেছে"}
          {!loading && !error && aiUsed ? " · AI Semantic Search সক্রিয়" : ""}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {submitted && !loading && !error && products.length === 0 && (
        <p>পণ্য পাওয়া যায়নি। অন্য শব্দ, বানান বা ফিল্টার দিয়ে চেষ্টা করুন।</p>
      )}

      {products.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 14, marginTop: 14 }}>
            {products.map((product) => (
              <article key={product.id} style={{ overflow: "hidden", border: "1px solid var(--border, #d8dfd8)", borderRadius: 12 }}>
                <Link
                  href={"/products/" + encodeURIComponent(product.slug)}
                  style={{ display: "block", aspectRatio: "1 / 1", background: "var(--surface, #f3f5f1)" }}
                >
                  {product.image_urls?.[0] ? (
                    <img src={product.image_urls[0]} alt={product.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ display: "grid", height: "100%", placeItems: "center" }}>NEWEIX</span>
                  )}
                </Link>
                <div style={{ padding: 12 }}>
                  <Link href={"/products/" + encodeURIComponent(product.slug)} style={{ fontWeight: 750 }}>
                    {product.name}
                  </Link>
                  <p style={{ margin: "7px 0", fontWeight: 800 }}>{money(Number(product.price))}</p>
                  <small>
                    {product.stock > 0 ? "স্টকে আছে" : "স্টক শেষ"}
                    {product.sku ? " · SKU: " + product.sku : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
          <nav aria-label="সার্চ ফলাফলের পৃষ্ঠা" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 20 }}>
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => void executeSearch(query, page - 1)}
            >
              আগের পৃষ্ঠা
            </button>
            <span aria-live="polite">পৃষ্ঠা {page}</span>
            <button
              type="button"
              disabled={loading || !hasMore}
              onClick={() => void executeSearch(query, page + 1)}
            >
              পরের পৃষ্ঠা
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
