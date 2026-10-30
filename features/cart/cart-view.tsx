"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  price: number;
  image_urls: string[] | null;
  stock: number;
};
type CartItem = { product_id: string; quantity: number };

function formatPrice(price: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.product_id === "string" &&
    item.product_id.length > 0 &&
    Number.isSafeInteger(item.quantity) &&
    Number(item.quantity) > 0 &&
    Number(item.quantity) <= 100;
}

export default function CartView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("neweix_cart");
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");
      const merged = new Map<string, number>();
      for (const item of parsed.filter(isCartItem)) {
        merged.set(item.product_id, Math.min(100, (merged.get(item.product_id) ?? 0) + item.quantity));
      }
      const normalized = Array.from(merged, ([product_id, quantity]) => ({ product_id, quantity }));
      setCart(normalized);
      localStorage.setItem("neweix_cart", JSON.stringify(normalized));
    } catch {
      setCart([]);
      setError("কার্টের তথ্য পড়া যায়নি। কার্ট নতুন করে তৈরি করুন।");
    }

    async function loadProducts() {
      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data)) throw new Error("পণ্য লোড করা যায়নি।");
        setProducts(result.data);
      } catch {
        setError("পণ্যের তথ্য লোড হয়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।");
      } finally {
        setLoading(false);
      }
    }
    void loadProducts();
  }, []);

  function saveCart(next: CartItem[]) {
    setCart(next);
    localStorage.setItem("neweix_cart", JSON.stringify(next));
    window.dispatchEvent(new Event("neweix-cart-change"));
  }

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const items = cart.flatMap((entry) => {
    const product = productMap.get(entry.product_id);
    return product ? [{ product, quantity: entry.quantity }] : [];
  });
  const unavailable = cart.filter((entry) => !productMap.has(entry.product_id));
  const stockIssues = items.filter(({ product, quantity }) => quantity > product.stock || product.stock < 1);
  const total = items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);

  function changeQuantity(product: Product, change: number) {
    const item = cart.find((entry) => entry.product_id === product.id);
    if (!item) return;
    const nextQuantity = item.quantity + change;
    if (nextQuantity < 1) {
      saveCart(cart.filter((entry) => entry.product_id !== product.id));
      return;
    }
    if (nextQuantity > product.stock || nextQuantity > 100) {
      setNotice("বর্তমান স্টকে এই পরিমাণ পণ্য নেই।");
      return;
    }
    saveCart(cart.map((entry) => entry.product_id === product.id ? { ...entry, quantity: nextQuantity } : entry));
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">NEWEIX · YOUR CART</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">আপনার শপিং কার্ট</h1>
            <p className="mt-2">অর্ডার নিশ্চিত করার আগে পণ্য ও পরিমাণ যাচাই করুন।</p>
          </div>
          <Link href="/products" className="text-sm font-semibold underline underline-offset-4" style={{ color: "var(--primary)" }}>← আরও পণ্য দেখুন</Link>
        </header>

        {notice && <p role="status" className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>{notice}</p>}
        {loading && <p aria-live="polite">কার্ট ও পণ্যের তথ্য লোড হচ্ছে...</p>}
        {!loading && error && <div role="alert" className="rounded-xl border p-4" style={{ borderColor: "var(--danger)", background: "var(--surface)" }}>{error}</div>}

        {!loading && !error && unavailable.length > 0 && (
          <div className="mb-5 rounded-xl border p-4" style={{ borderColor: "var(--danger)", background: "var(--surface)" }}>
            <p>কার্টের {unavailable.length}টি পণ্য আর সক্রিয় নেই বা পাওয়া যাচ্ছে না। এগুলো সরিয়ে নিন।</p>
            <button type="button" className="mt-2 rounded-lg px-4 py-2 text-sm font-bold" style={{ background: "var(--primary)", color: "#080b09" }} onClick={() => saveCart(cart.filter((entry) => productMap.has(entry.product_id)))}>অপ্রাপ্য পণ্য সরান</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <section className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h2 className="text-xl font-bold">আপনার কার্ট এখন খালি</h2>
            <p className="mt-2">পছন্দের পণ্য যোগ করে কেনাকাটা শুরু করুন।</p>
            <Link href="/products" className="mt-5 inline-flex rounded-xl px-5 py-3 font-bold" style={{ background: "var(--primary)", color: "#080b09" }}>পণ্য দেখুন ↗</Link>
          </section>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="space-y-3" aria-label="কার্টের পণ্য">
              {items.map(({ product, quantity }) => (
                <article key={product.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  {product.image_urls?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_urls[0]} alt={product.name} loading="lazy" className="h-20 w-20 rounded-xl object-cover" />
                  ) : <div className="grid h-20 w-20 place-items-center rounded-xl text-xs font-black" style={{ background: "var(--surface-raised)", color: "var(--primary)" }}>NEWEIX</div>}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold">{product.name}</h2>
                    <p className="mt-1">{formatPrice(Number(product.price))} · স্টক {product.stock}</p>
                    {quantity > product.stock && <p role="alert" style={{ color: "var(--danger)" }}>স্টকের চেয়ে বেশি পরিমাণ কার্টে আছে।</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" aria-label={product.name + " পরিমাণ কমান"} onClick={() => changeQuantity(product, -1)} className="h-9 w-9 rounded-lg border" style={{ borderColor: "var(--border)" }}>−</button>
                      <span className="min-w-8 text-center font-bold">{quantity}</span>
                      <button type="button" aria-label={product.name + " পরিমাণ বাড়ান"} disabled={quantity >= product.stock} onClick={() => changeQuantity(product, 1)} className="h-9 w-9 rounded-lg border" style={{ borderColor: "var(--border)" }}>+</button>
                      <button type="button" onClick={() => saveCart(cart.filter((entry) => entry.product_id !== product.id))} className="ml-2 text-sm underline underline-offset-4" style={{ color: "var(--danger)" }}>সরান</button>
                    </div>
                  </div>
                  <strong className="text-lg" style={{ color: "var(--primary)" }}>{formatPrice(Number(product.price) * quantity)}</strong>
                </article>
              ))}
            </section>

            <aside className="h-fit rounded-2xl border p-5 lg:sticky lg:top-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h2 className="text-xl font-bold">অর্ডার সারাংশ</h2>
              <div className="mt-5 flex justify-between gap-3"><span>পণ্য ({items.length}টি)</span><strong>{formatPrice(total)}</strong></div>
              <div className="mt-3 flex justify-between gap-3"><span>ডেলিভারি</span><span>চেকআউটে নিশ্চিত হবে</span></div>
              <hr className="my-5" />
              <div className="flex justify-between gap-3 text-lg font-black"><span>মোট</span><strong style={{ color: "var(--primary)" }}>{formatPrice(total)}</strong></div>
              {stockIssues.length > 0 && <p role="alert" className="mt-4 text-sm" style={{ color: "var(--danger)" }}>চেকআউটের আগে পণ্যের পরিমাণ ঠিক করুন।</p>}
              {unavailable.length > 0 && <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>অপ্রাপ্য পণ্য সরানোর পর এগিয়ে যান।</p>}
              {stockIssues.length === 0 && unavailable.length === 0 ? (
                <Link href="/checkout" className="mt-5 flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-center font-bold" style={{ background: "var(--primary)", color: "#080b09" }}>চেকআউটে এগিয়ে যান →</Link>
              ) : <button type="button" disabled className="mt-5 w-full rounded-xl px-4 py-3 font-bold" style={{ background: "var(--surface-raised)" }}>আগে কার্ট ঠিক করুন</button>}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}