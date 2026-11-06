"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useEffect, useMemo, useState } from "react";
import ProductCardActions from "@/features/products/product-card-actions";
import { loadSavedProductLists, mutateSavedProduct, readSavedProductLists, writeSavedProductLists } from "@/lib/customer-saved-products";

type Product = { id: string; name: string; slug: string; description: string | null; price: number; image_urls: string[] | null; stock: number };
const KEY = "neweix_wishlist";

function readIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, 200) : [];
  } catch { return []; }
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);
}

export default function WishlistView() {
  const [ids, setIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setIds(readIds());
    void loadSavedProductLists().then((lists) => setIds(lists.wishlist));
    let active = true;
    fetch("/api/products", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.data)) throw new Error("Could not load product information.");
        if (active) setProducts(data.data);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load data."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const saved = useMemo(() => products.filter((product) => ids.includes(product.id)), [products, ids]);

  function remove(id: string) {
    const next = ids.filter((value) => value !== id);
    setIds(next);
    try {
      const lists = readSavedProductLists();
      writeSavedProductLists({ ...lists, wishlist: next });
      void mutateSavedProduct("wishlist", id, "remove").then((result) => { if (!result.ok) setError(result.error || "Could not sync your wishlist."); });
    } catch { setError("Could not save your wishlist."); }
  }

  return (
    <main className="premium-wishlist min-h-screen px-4 py-10 sm:px-6 sm:py-14" style={{ background: "var(--porcelain)", color: "var(--navy)" }}>
      <div className="mx-auto max-w-7xl">
        <header className="premium-wishlist-header mb-8 flex flex-wrap items-end justify-between gap-5 rounded-3xl border p-6 sm:p-9" style={{ borderColor: "var(--border)", background: "radial-gradient(ellipse at 100% 0%, rgba(197,165,106,.15), transparent 42%), linear-gradient(135deg, var(--surface-raised), var(--surface-soft))", boxShadow: "0 18px 50px rgba(20,43,59,.06)" }}>
          <div className="max-w-2xl">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: "var(--emerald)" }}><Icon name="chevron-left" size={16} /> NEWEIX Home</Link>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.2em]" style={{ color: "var(--gold)" }}>Your saved collection</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">My wishlist</h1>
            <p className="mt-3 text-sm leading-6 sm:text-base" style={{ color: "var(--muted)" }}>Keep the products you love in one place and come back when you are ready.</p>
            <p className="mt-4 text-xs font-semibold" style={{ color: "var(--muted)" }}>{saved.length} {saved.length === 1 ? "product" : "products"} saved</p>
          </div>
          <Link href="/products" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: "var(--emerald)", color: "#fff" }}>Continue shopping <Icon name="arrow-right" size={16} /></Link>
        </header>

        {loading && <p role="status" className="rounded-2xl border p-5 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-raised)" }}>Loading your wishlist…</p>}
        {error && <p role="alert" className="mb-5 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface-raised)" }}>{error}</p>}
        {!loading && saved.length === 0 && <section className="rounded-3xl border px-6 py-14 text-center sm:py-20" style={{ borderColor: "var(--border)", background: "var(--surface-raised)", boxShadow: "0 14px 38px rgba(20,43,59,.045)" }}>
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(8,127,99,.09)", color: "var(--emerald)" }}><Icon name="heart" size={30} /></span>
          <h2 className="mt-5 text-xl font-bold">Your wishlist is waiting</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--muted)" }}>Tap the heart on any product to save it here. Your favourite finds will be easy to revisit.</p>
          <Link href="/products" className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: "var(--emerald)", color: "#fff" }}>Explore products <Icon name="arrow-right" size={16} /></Link>
        </section>}

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {saved.map((product) => <article key={product.id} className="premium-wishlist-card group overflow-hidden rounded-3xl border transition duration-200 hover:-translate-y-1" style={{ borderColor: "var(--border)", background: "var(--surface-raised)", boxShadow: "0 12px 32px rgba(20,43,59,.05)" }}>
            <Link href={`/products/${encodeURIComponent(product.slug)}`} className="relative flex aspect-[4/3] items-center justify-center overflow-hidden p-4" style={{ background: "linear-gradient(145deg, var(--surface-soft), var(--surface))" }}>
              {product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name} loading="lazy" className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.04]" /> : <span className="text-sm font-black tracking-widest" style={{ color: "var(--muted)" }}>NEWEIX</span>}
            </Link>
            <div className="p-5">
              <Link href={`/products/${encodeURIComponent(product.slug)}`} className="line-clamp-2 font-bold leading-6 hover:underline">{product.name}</Link>
              <p className="mt-3 text-lg font-black" style={{ color: "var(--emerald)" }}>{money(Number(product.price))}</p>
              <p className="mt-1 text-xs font-semibold" style={{ color: product.stock > 0 ? "var(--success)" : "var(--danger)" }}>{product.stock > 0 ? `In stock · ${product.stock}` : "Out of stock"}</p>
              <div className="mt-4"><ProductCardActions productId={product.id} stock={product.stock} /></div>
              <button type="button" onClick={() => remove(product.id)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition hover:bg-red-50" style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface)" }}><Icon name="trash" size={15} /> Remove from wishlist</button>
            </div>
          </article>)}
        </section>
      </div>
    </main>
  );
}
