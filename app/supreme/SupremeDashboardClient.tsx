"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold?: number;
};

export default function SupremeDashboardClient() {
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
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            NEWEIX · SUPREME PANEL
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Supreme Dashboard
          </h1>

          <p className="mt-2 text-gray-600">
            পণ্য ও স্টকের বর্তমান তথ্য
          </p>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="mt-5 rounded-lg bg-blue-700 px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {loading ? "লোড হচ্ছে..." : "তথ্য রিফ্রেশ করুন"}
          </button>
        </header>

        {error && (
          <section
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">
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

            <p className="mt-2 text-3xl font-bold text-red-700">
              {loading ? "—" : lowStockProducts.length}
            </p>
          </article>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">
            কম স্টকের পণ্য
          </h2>

          {loading ? (
            <p className="mt-4 text-gray-600">
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

                  <span className="shrink-0 font-semibold text-red-700">
                    স্টক: {product.stock}
                  </span>
                </div>
              ))}
            </div>
          )}

          <a
            href="/admin/products"
            className="mt-5 inline-block rounded-lg border border-blue-700 px-4 py-3 font-medium text-blue-700"
          >
            সব পণ্য ও স্টক দেখুন →
          </a>
        </section>
      </div>
    </main>
  );
}