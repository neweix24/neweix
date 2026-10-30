"use client";

import { useCallback, useEffect, useState } from "react";

type Role = "supreme" | "admin" | "staff" | string;

type Product = {
  id: string;
  name: string;
  slug: string;
  stock: number;
  low_stock_threshold: number;
  sku?: string | null;
  price?: number | string;
  is_active?: boolean;
};

type Props = {
  role: Role;
};

export default function ProductsManager({ role }: Props) {
  const canManageProducts = role === "supreme" || role === "admin";
  const isStaff = role === "staff";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadProducts = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch("/api/admin/products", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "পণ্যের তালিকা আনা যায়নি।");
      }

      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "পণ্য লোড করতে সমস্যা হয়েছে।"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  return (
    <section className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">পণ্যের তালিকা ও স্টক</h2>
            <p className="mt-1 text-sm text-gray-600">
              মোট পণ্য: {products.length}
            </p>
            {isStaff && (
              <p className="mt-2 text-sm text-gray-600">
                আপনার অ্যাকাউন্টে শুধু পণ্য ও স্টক দেখার অনুমতি রয়েছে।
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadProducts(true)}
            disabled={loading || refreshing}
            className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50"
          >
            {refreshing ? "রিফ্রেশ হচ্ছে..." : "রিফ্রেশ"}
          </button>
        </div>

        {loading ? (
          <p className="py-6 text-gray-600">পণ্য লোড হচ্ছে...</p>
        ) : products.length === 0 ? (
          <p className="py-6 text-gray-600">কোনো পণ্য পাওয়া যায়নি।</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3">পণ্য</th>

                  {!isStaff && (
                    <>
                      <th className="p-3">SKU</th>
                      <th className="p-3">মূল্য</th>
                      <th className="p-3">অবস্থা</th>
                    </>
                  )}

                  <th className="p-3">স্টক</th>

                  {!isStaff && <th className="p-3">কাজ</th>}
                </tr>
              </thead>

              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b last:border-0">
                    <td className="p-3">
                      <p className="font-semibold">{product.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {product.slug}
                      </p>
                    </td>

                    {!isStaff && (
                      <>
                        <td className="p-3">{product.sku || "—"}</td>
                        <td className="p-3">
                          ৳{Number(product.price ?? 0).toLocaleString("en-BD")}
                        </td>
                        <td className="p-3">
                          {product.is_active ? (
                            <span className="text-green-700">সক্রিয়</span>
                          ) : (
                            <span className="text-gray-500">নিষ্ক্রিয়</span>
                          )}
                        </td>
                      </>
                    )}

                    <td className="p-3">
                      <span
                        className={
                          product.stock <= product.low_stock_threshold
                            ? "font-semibold text-red-700"
                            : "text-gray-800"
                        }
                      >
                        {product.stock}
                      </span>

                      {product.stock <= product.low_stock_threshold && (
                        <p className="mt-1 text-xs text-red-700">
                          স্টক কম
                        </p>
                      )}
                    </td>

                    {!isStaff && (
                      <td className="p-3">
                        {canManageProducts ? (
                          <span className="text-gray-600">
                            সম্পাদনার জন্য আগের পূর্ণ ব্যবস্থাপনা কম্পোনেন্ট
                            প্রয়োজন।
                          </span>
                        ) : (
                          <span className="text-gray-400">শুধু দেখা</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}