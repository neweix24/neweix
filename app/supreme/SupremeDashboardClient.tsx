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
          data.error || "Could not load product information."
        );
      }

      setProducts(
        Array.isArray(data.products) ? data.products : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the server."
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
          <p className="text-sm font-semibold uppercase tracking-wider text-lime-300">
            NEWEIX · SUPREME PANEL
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Supreme Dashboard
          </h1>

          <p className="mt-2 text-gray-600">
            Current Product & Stock Information
          </p>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="mt-5 rounded-lg bg-lime-300 px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh Data"}
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
              Total Products
            </p>

            <p className="mt-2 text-3xl font-bold">
              {loading ? "—" : products.length}
            </p>
          </article>

          <article className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-600">
              Low-Stock Products
            </p>

            <p className="mt-2 text-3xl font-bold text-red-700">
              {loading ? "—" : lowStockProducts.length}
            </p>
          </article>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">
            Low-Stock Products
          </h2>

          {loading ? (
            <p className="mt-4 text-gray-600">
              Loading data from the database...
            </p>
          ) : error ? (
            <p className="mt-4 text-gray-600">
              No data available. See the message above.
            </p>
          ) : lowStockProducts.length === 0 ? (
            <p className="mt-4 text-gray-600">
              There are currently no low-stock products.
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
                    Stock: {product.stock}
                  </span>
                </div>
              ))}
            </div>
          )}

          <a
            href="/admin/products"
            className="mt-5 inline-block rounded-lg border border-lime-300 px-4 py-3 font-medium text-lime-300"
          >
            View All Products & Stock →
          </a>
        </section>
      </div>
    </main>
  );
}