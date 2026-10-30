"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; slug: string; description: string | null; price: number; image_urls: string[] | null; stock: number };
const KEY = "neweix_wishlist";

function readIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, 200) : [];
  } catch { return []; }
}

function money(value: number) {
  return new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);
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
        if (!response.ok || !Array.isArray(data.data)) throw new Error("পণ্যের তথ্য লোড করা যায়নি।");
        if (active) setProducts(data.data);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "তথ্য লোড করা যায়নি।"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const saved = useMemo(() => products.filter((product) => ids.includes(product.id)), [products, ids]);

  function remove(id: string) {
    const next = ids.filter((value) => value !== id);
    setIds(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { setError("Wishlist সংরক্ষণ করা যায়নি।"); }
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><Link href="/" className="text-sm font-bold" style={{ color: "var(--primary)" }}>← NEWEIX</Link><p className="mt-5 text-xs tracking-[.2em]" style={{ color: "var(--muted)" }}>YOUR SAVED ITEMS</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">আমার পছন্দের পণ্য</h1><p className="mt-2" style={{ color: "var(--muted)" }}>সংরক্ষিত পণ্যগুলো এখানে পাবেন।</p></div>
          <Link href="/products" className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>আরও পণ্য দেখুন</Link>
        </header>
        {loading && <p role="status">Wishlist লোড হচ্ছে…</p>}
        {error && <p role="alert" className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface-raised)" }}>{error}</p>}
        {!loading && saved.length === 0 && <section className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><h2 className="text-xl font-bold">এখনো কোনো পণ্য সংরক্ষণ করেননি</h2><p className="mt-2" style={{ color: "var(--muted)" }}>পণ্যের পাশে ♡ চিহ্নে চাপ দিয়ে পছন্দের তালিকায় রাখুন।</p><Link href="/products" className="mt-5 inline-flex rounded-xl px-5 py-3 font-bold" style={{ background: "var(--primary)", color: "#080b09" }}>পণ্য দেখুন</Link></section>}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((product) => <article key={product.id} className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <Link href={`/products/${encodeURIComponent(product.slug)}`} className="flex aspect-[4/3] items-center justify-center overflow-hidden" style={{ background: "var(--bg)" }}>{product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name} loading="lazy" className="h-full w-full object-cover" /> : <span>NEWEIX</span>}</Link>
            <div className="p-4"><Link href={`/products/${encodeURIComponent(product.slug)}`} className="font-bold">{product.name}</Link><p className="mt-2 font-semibold" style={{ color: "var(--primary)" }}>{money(Number(product.price))}</p><p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{product.stock > 0 ? `স্টকে আছে · ${product.stock}` : "স্টক শেষ"}</p><button type="button" onClick={() => remove(product.id)} className="mt-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>পছন্দের তালিকা থেকে সরান</button></div>
          </article>)}
        </section>
      </div>
    </main>
  );
}
