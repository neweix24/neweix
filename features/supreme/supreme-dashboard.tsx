"use client";

import Link from "next/link";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold?: number;
};

export default function SupremeDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/products", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "পণ্যের তথ্য লোড করা যায়নি।"
        );
      }

      setProducts(
        Array.isArray(data.products) ? data.products : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "সার্ভারের সঙ্গে সংযোগ করা যায়নি।"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const lowStockProducts = products.filter(
    (product) =>
      product.stock <= (product.low_stock_threshold ?? 5)
  );

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="neweix-panel rounded-2xl p-6 sm:p-8">
          <p className="neweix-kicker">
            NEWEIX · SUPREME PANEL
          </p>

          <h1 className="neweix-page-title">
            Supreme Dashboard
          </h1>

          <p className="mt-2" style={{ color: "var(--muted)" }}>
            পণ্য ও স্টকের বর্তমান তথ্য
          </p>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="neweix-button-primary mt-5 disabled:opacity-50"
          >
            {loading ? "লোড হচ্ছে..." : "তথ্য রিফ্রেশ করুন"}
          </button>
        </header>

        {error && (
          <section
            role="alert"
            className="rounded-xl border p-4" style={{ borderColor: "var(--danger)", background: "var(--surface-raised)", color: "var(--danger)" }}
          >
            {error}
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="neweix-panel rounded-xl p-5">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              মোট পণ্য
            </p>

            <p className="mt-2 text-3xl font-bold">
              {loading ? "—" : products.length}
            </p>
          </article>

          <article className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">
              কম স্টকের পণ্য
            </p>

            <p className="mt-2 text-3xl font-bold" style={{ color: "var(--danger)" }}>
              {loading ? "—" : lowStockProducts.length}
            </p>
          </article>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">
            কম স্টকের পণ্য
          </h2>

          {loading ? (
            <p className="mt-4" style={{ color: "var(--muted)" }}>
              ডেটাবেস থেকে তথ্য আনা হচ্ছে...
            </p>
          ) : error ? (
            <p className="mt-4 text-gray-600">
              তথ্য পাওয়া যায়নি। উপরের বার্তাটি দেখুন।
            </p>
          ) : lowStockProducts.length === 0 ? (
            <p className="mt-4 text-gray-600">
              বর্তমানে কম স্টকের কোনো পণ্য নেই।
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-4 border-b pb-3 last:border-0"
                >
                  <span className="font-medium">
                    {product.name}
                  </span>

                  <span className="shrink-0 font-semibold" style={{ color: "var(--danger)" }}>
                    স্টক: {product.stock}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Link
            href="/admin/products"
            className="mt-5 inline-block rounded-lg border px-4 py-3 font-medium"
            style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
          >
            সব পণ্য ও স্টক দেখুন →
          </Link>
        </section>
      </div>
    </main>
  );
}