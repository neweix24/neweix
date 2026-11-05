"use client";

import Link from "next/link";
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
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "radial-gradient(ellipse at 85% 0%, rgba(182,255,74,.14), transparent 38%), linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 rounded-3xl border p-7 sm:p-10" style={{ borderColor: "#dfeade", background: "radial-gradient(ellipse at 100% 0%,rgba(182,255,74,.18),transparent 45%),linear-gradient(135deg,#fff,#f5ffef)", boxShadow: "0 14px 38px rgba(45,110,65,.07)" }}>
          <div>
            <Link href="/products" className="text-sm font-semibold" style={{ color: "var(--primary)" }}>← All products</Link>
            <p className="mt-5 text-xs tracking-[.2em]" style={{ color: "var(--muted)" }}>PRODUCT COMPARISON</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Compare products</h1>
            <p className="mt-2" style={{ color: "var(--muted)" }}>Compare up to 4 products side by side before making a decision.</p>
          </div>
          {selected.length > 0 && <button type="button" onClick={clear} className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>Clear list</button>}
        </header>
        {loading && <p role="status">Loading product information…</p>}
        {error && <p role="alert" className="mb-4 rounded-xl border p-4" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface-raised)" }}>{error}</p>}
        {!loading && selected.length === 0 && <section className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="text-xl font-bold">No products to compare</h2>
          <p className="mt-2" style={{ color: "var(--muted)" }}>Add products by selecting “Compare” in the product catalog.</p>
          <Link href="/products" className="mt-5 inline-flex rounded-xl px-5 py-3 font-bold" style={{ background: "var(--primary)", color: "#080b09" }}>Browse products</Link>
        </section>}
        {!loading && selected.length > 0 && <div className="overflow-x-auto rounded-3xl border" style={{ borderColor: "#dfeade", background: "rgba(255,255,255,.97)", boxShadow: "0 14px 38px rgba(45,110,65,.07)" }}>
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead style={{ background: "#f5fbf1" }}><tr><th className="w-36 border-b p-4" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Feature</th>
              {selected.map((product) => <th key={product.id} className="min-w-48 border-b p-4 align-top" style={{ borderColor: "var(--border)" }}>
                <Link href={`/products/${encodeURIComponent(product.slug)}`} className="font-bold hover:underline">{product.name}</Link>
                <button type="button" onClick={() => remove(product.id)} className="mt-2 block text-xs font-medium" style={{ color: "var(--danger)" }}>Remove from comparison</button>
              </th>)}
            </tr></thead>
            <tbody>
              <tr><th className="border-b p-4" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Image</th>{selected.map((p) => <td key={p.id} className="border-b p-4" style={{ borderColor: "var(--border)" }}><Link href={`/products/${encodeURIComponent(p.slug)}`} className="flex h-40 items-center justify-center overflow-hidden rounded-2xl p-2" style={{ background: "linear-gradient(145deg,#f5faef,#f2faf7)" }}>{p.image_urls?.[0] ? <img src={p.image_urls[0]} alt={p.name} className="h-full w-full object-contain" loading="lazy" /> : <span>NEWEIX</span>}</Link></td>)}</tr>
              <tr><th className="border-b p-4" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Price</th>{selected.map((p) => <td key={p.id} className="border-b p-4 text-base font-black" style={{ borderColor: "var(--border)", color: "#28764b" }}>{money(p.price)}{p.compare_at_price != null && p.compare_at_price > p.price && <del className="ml-2 block text-xs font-normal" style={{ color: "var(--muted)" }}>{money(p.compare_at_price)}</del>}</td>)}</tr>
              <tr><th className="border-b p-4" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Stock</th>{selected.map((p) => <td key={p.id} className="border-b p-4" style={{ borderColor: "var(--border)" }}>{p.stock > 0 ? `In stock · ${p.stock}` : "Out of stock"}</td>)}</tr>
              <tr><th className="border-b p-4" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Description</th>{selected.map((p) => <td key={p.id} className="border-b p-4 align-top leading-6" style={{ borderColor: "var(--border)" }}>{p.description || "No description available"}</td>)}</tr>
              <tr><th className="p-4" style={{ color: "var(--muted)" }}>Product page</th>{selected.map((p) => <td key={p.id} className="p-4"><Link href={`/products/${encodeURIComponent(p.slug)}`} className="font-semibold underline" style={{ color: "var(--primary)" }}>View details</Link></td>)}</tr>
            </tbody>
          </table>
        </div>}
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>Your comparison list is saved in this browser. You can compare up to {LIMIT}টি পণ্য রাখা যাবে।</p>
      </div>
    </main>
  );
}
