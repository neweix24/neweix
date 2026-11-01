"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useEffect, useMemo, useState } from "react";
import ProductCardActions from "@/features/products/product-card-actions";

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
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { setError("Could not save your wishlist."); }
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "radial-gradient(ellipse at 85% 0%, rgba(182,255,74,.14), transparent 38%), linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border p-7 sm:p-10" style={{ borderColor: "#dfeade", background: "radial-gradient(ellipse at 100% 0%,rgba(182,255,74,.18),transparent 45%),linear-gradient(135deg,#fff,#f5ffef)", boxShadow: "0 14px 38px rgba(45,110,65,.07)" }}>
          <div><Link href="/" className="text-sm font-bold" style={{ color: "var(--primary)" }}>← NEWEIX</Link><p className="mt-5 text-xs tracking-[.2em]" style={{ color: "var(--muted)" }}>YOUR SAVED ITEMS</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">My wishlist</h1><p className="mt-2" style={{ color: "var(--muted)" }}>Your saved products appear here.</p></div>
          <Link href="/products" className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>Continue shopping</Link>
        </header>
        {loading && <p role="status">Loading your wishlist…</p>}
        {error && <p role="alert" className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface-raised)" }}>{error}</p>}
        {!loading && saved.length === 0 && <section className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><h2 className="text-xl font-bold">You have not saved any products yet</h2><p className="mt-2" style={{ color: "var(--muted)" }}>Select the ♡ icon on a product to save it to your wishlist.</p><Link href="/products" className="mt-5 inline-flex rounded-xl px-5 py-3 font-bold" style={{ background: "var(--primary)", color: "#080b09" }}>Browse products</Link></section>}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((product) => <article key={product.id} className="overflow-hidden rounded-3xl border transition duration-200 hover:-translate-y-1" style={{ borderColor: "#e0eae0", background: "rgba(255,255,255,.96)", boxShadow: "0 12px 30px rgba(45,110,65,.06)" }}>
            <Link href={`/products/${encodeURIComponent(product.slug)}`} className="flex aspect-[4/3] items-center justify-center overflow-hidden p-3" style={{ background: "linear-gradient(145deg,#f5faef,#f2faf7)" }}>{product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name} loading="lazy" className="h-full w-full object-cover" /> : <span>NEWEIX</span>}</Link>
            <div className="p-5"><Link href={`/products/${encodeURIComponent(product.slug)}`} className="font-bold">{product.name}</Link><p className="mt-2 text-lg font-black" style={{ color: "#28764b" }}>{money(Number(product.price))}</p><p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{product.stock > 0 ? `In stock · ${product.stock}` : "Out of stock"}</p><div className="mt-3"><ProductCardActions productId={product.id} stock={product.stock} /></div><button type="button" onClick={() => remove(product.id)} className="mt-3 rounded-xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#e3caca", color: "#9b4141", background: "#fffafa" }}><Icon name="trash" size={16} /> Remove from wishlist</button></div>
          </article>)}
        </section>
      </div>
    </main>
  );
}
