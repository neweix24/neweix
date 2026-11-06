"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useEffect, useMemo, useState } from "react";
import { loadSavedProductLists, mutateSavedProduct, readSavedProductLists, writeSavedProductLists } from "@/lib/customer-saved-products";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price?: number | null;
  image_urls: string[] | null;
  stock: number;
  is_featured?: boolean;
};
const KEY = "neweix_compare";
const LIMIT = 4;

function readIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(value));
}

export default function CompareView() {
  const [ids, setIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = () => setIds(readIds());
    sync();
    void loadSavedProductLists().then((lists) => setIds(lists.compare));
    window.addEventListener("storage", sync);
    window.addEventListener("neweix-compare-change", sync);
    let active = true;
    fetch("/api/products", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data)) throw new Error("Could not load product information.");
        if (active) setProducts(result.data);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load products."); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      window.removeEventListener("storage", sync);
      window.removeEventListener("neweix-compare-change", sync);
    };
  }, []);

  const selected = useMemo(() => ids.map((id) => products.find((product) => product.id === id)).filter((product): product is Product => Boolean(product)), [ids, products]);

  function remove(id: string) {
    const next = ids.filter((value) => value !== id);
    try {
      const lists = readSavedProductLists();
      writeSavedProductLists({ ...lists, compare: next });
      setIds(next);
      void mutateSavedProduct("compare", id, "remove").then((result) => { if (!result.ok) setError(result.error || "Could not sync your comparison list."); });
      window.dispatchEvent(new Event("neweix-compare-change"));
    } catch {
      setError("Could not update your comparison list.");
    }
  }

  function clear() {
    try {
      const lists = readSavedProductLists();
      writeSavedProductLists({ ...lists, compare: [] });
      setIds([]);
      for (const id of ids) void mutateSavedProduct("compare", id, "remove");
      window.dispatchEvent(new Event("neweix-compare-change"));
    } catch {
      setError("Could not clear your comparison list.");
    }
  }

  return (
    <main className="premium-compare min-h-screen px-4 py-10 sm:px-6 sm:py-14" style={{ background: "var(--porcelain)", color: "var(--navy)" }}>
      <div className="mx-auto max-w-7xl">
        <header className="premium-compare-header mb-8 flex flex-wrap items-end justify-between gap-5 rounded-3xl border p-6 sm:p-9" style={{ borderColor: "var(--border)", background: "radial-gradient(ellipse at 100% 0%, rgba(197,165,106,.15), transparent 42%), linear-gradient(135deg, var(--surface-raised), var(--surface-soft))", boxShadow: "0 18px 50px rgba(20,43,59,.06)" }}>
          <div className="max-w-2xl">
            <Link href="/products" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: "var(--emerald)" }}><Icon name="chevron-left" size={16} /> All products</Link>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.2em]" style={{ color: "var(--gold)" }}>Smarter shopping decisions</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Compare products</h1>
            <p className="mt-3 text-sm leading-6 sm:text-base" style={{ color: "var(--muted)" }}>Compare up to {LIMIT} products side by side and choose with confidence.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--border)", background: "var(--surface-raised)", color: "var(--muted)" }}>{selected.length} / {LIMIT} selected</span>
            {selected.length > 0 && <button type="button" onClick={clear} className="rounded-xl border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface-raised)", color: "var(--navy)" }}>Clear list</button>}
          </div>
        </header>

        {loading && <p role="status" className="rounded-2xl border p-5 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-raised)" }}>Loading product information…</p>}
        {error && <p role="alert" className="mb-5 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface-raised)" }}>{error}</p>}
        {!loading && selected.length === 0 && <section className="rounded-3xl border px-6 py-14 text-center sm:py-20" style={{ borderColor: "var(--border)", background: "var(--surface-raised)", boxShadow: "0 14px 38px rgba(20,43,59,.045)" }}>
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(8,127,99,.09)", color: "var(--emerald)" }}><Icon name="compare" size={30} /></span>
          <h2 className="mt-5 text-xl font-bold">Build your comparison</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: "var(--muted)" }}>Choose Compare on products in the catalog. Add up to four items to review their price, availability and details together.</p>
          <Link href="/products" className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: "var(--emerald)", color: "#fff" }}>Browse products <Icon name="arrow-right" size={16} /></Link>
        </section>}
        {!loading && selected.length > 0 && <div className="premium-compare-table overflow-x-auto rounded-3xl border" style={{ borderColor: "var(--border)", background: "var(--surface-raised)", boxShadow: "0 14px 38px rgba(20,43,59,.055)" }}>
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead style={{ background: "var(--surface-soft)" }}><tr><th className="w-36 border-b p-4 text-xs font-bold uppercase tracking-wider" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Feature</th>
              {selected.map((product) => <th key={product.id} className="min-w-48 border-b p-4 align-top" style={{ borderColor: "var(--border)" }}>
                <Link href={`/products/${encodeURIComponent(product.slug)}`} className="font-bold hover:underline" style={{ color: "var(--navy)" }}>{product.name}</Link>
                <button type="button" onClick={() => remove(product.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--danger)" }}><Icon name="x" size={13} /> Remove</button>
              </th>)}
            </tr></thead>
            <tbody>
              <tr><th className="border-b p-4 text-xs font-bold uppercase tracking-wider" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Image</th>{selected.map((p) => <td key={p.id} className="border-b p-4" style={{ borderColor: "var(--border)" }}><Link href={`/products/${encodeURIComponent(p.slug)}`} className="flex h-40 items-center justify-center overflow-hidden rounded-2xl p-3" style={{ background: "var(--surface-soft)" }}>{p.image_urls?.[0] ? <img src={p.image_urls[0]} alt={p.name} className="h-full w-full object-contain" loading="lazy" /> : <span className="text-xs font-bold tracking-widest" style={{ color: "var(--muted)" }}>NEWEIX</span>}</Link></td>)}</tr>
              <tr><th className="border-b p-4 text-xs font-bold uppercase tracking-wider" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Price</th>{selected.map((p) => <td key={p.id} className="border-b p-4 text-base font-black" style={{ borderColor: "var(--border)", color: "var(--emerald)" }}>{money(p.price)}{p.compare_at_price != null && p.compare_at_price > p.price && <del className="ml-2 block text-xs font-normal" style={{ color: "var(--muted)" }}>{money(p.compare_at_price)}</del>}</td>)}</tr>
              <tr><th className="border-b p-4 text-xs font-bold uppercase tracking-wider" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Availability</th>{selected.map((p) => <td key={p.id} className="border-b p-4 font-semibold" style={{ borderColor: "var(--border)", color: p.stock > 0 ? "var(--success)" : "var(--danger)" }}>{p.stock > 0 ? `In stock · ${p.stock}` : "Out of stock"}</td>)}</tr>
              <tr><th className="border-b p-4 text-xs font-bold uppercase tracking-wider" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Description</th>{selected.map((p) => <td key={p.id} className="border-b p-4 align-top leading-6" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>{p.description || "No description available"}</td>)}</tr>
              <tr><th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Product page</th>{selected.map((p) => <td key={p.id} className="p-4"><Link href={`/products/${encodeURIComponent(p.slug)}`} className="inline-flex items-center gap-2 font-bold" style={{ color: "var(--emerald)" }}>View details <Icon name="arrow-right" size={14} /></Link></td>)}</tr>
            </tbody>
          </table>
        </div>}
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>Your comparison list is saved in this browser. You can compare up to {LIMIT} products.</p>
      </div>
    </main>
  );
}
