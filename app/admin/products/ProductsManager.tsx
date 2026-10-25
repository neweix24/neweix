"use client";

import { useCallback, useEffect, useState } from "react";

type Role = "supreme" | "admin" | "staff" | string;

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  image_urls: string[];
  stock: number;
  category_id: string | null;
  video_url: string | null;
  variants: unknown[];
  sku: string | null;
  is_active: boolean;
  is_featured: boolean;
  weight_grams: number;
  low_stock_threshold: number;
  created_at: string;
  updated_at?: string;
};

type Props = {
  role: Role;
};

const emptyForm = {
  name: "",
  slug: "",
  description: "",
  price: "",
  compare_at_price: "",
  stock: "0",
  sku: "",
  category_id: "",
  image_urls: "",
  video_url: "",
  variants: "[]",
  weight_grams: "500",
  low_stock_threshold: "5",
  is_active: true,
  is_featured: false,
};

export default function ProductsManager({ role }: Props) {
  const canManageProducts = role === "supreme" || role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
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
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function updateForm<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K]
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageProducts) {
      setError("আপনার পণ্য যোগ করার অনুমতি নেই।");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    let variants: unknown;

    try {
      variants = JSON.parse(form.variants);

      if (!Array.isArray(variants)) {
        throw new Error("Variants অবশ্যই JSON array হতে হবে।");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Variants JSON সঠিক নয়।"
      );
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      compare_at_price:
        form.compare_at_price.trim() === ""
          ? null
          : Number(form.compare_at_price),
      stock: Number(form.stock),
      sku: form.sku.trim() || null,
      category_id: form.category_id.trim() || null,
      image_urls: form.image_urls
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean),
      video_url: form.video_url.trim() || null,
      variants,
      weight_grams: Number(form.weight_grams),
      low_stock_threshold: Number(form.low_stock_threshold),
      is_active: form.is_active,
      is_featured: form.is_featured,
    };

    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "পণ্য তৈরি করা যায়নি।");
      }

      setForm({ ...emptyForm });
      setNotice("পণ্য সফলভাবে যোগ হয়েছে।");
      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "পণ্য যোগ করতে সমস্যা হয়েছে।"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-8">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800"
        >
          {notice}
        </div>
      )}

      {canManageProducts && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-xl font-bold">নতুন পণ্য যোগ করুন</h2>

          <form onSubmit={createProduct} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  পণ্যের নাম *
                </span>
                <input
                  required
                  maxLength={180}
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((previous) => ({
                      ...previous,
                      name,
                      slug:
                        previous.slug ===
                        previous.name
                          .toLowerCase()
                          .trim()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, "")
                          ? name
                              .toLowerCase()
                              .trim()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/^-|-$/g, "")
                          : previous.slug || name
                              .toLowerCase()
                              .trim()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/^-|-$/g, ""),
                    }));
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Slug *
                </span>
                <input
                  required
                  maxLength={200}
                  value={form.slug}
                  onChange={(e) => updateForm("slug", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  মূল্য *
                </span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => updateForm("price", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  আগের মূল্য
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.compare_at_price}
                  onChange={(e) =>
                    updateForm("compare_at_price", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  স্টক সংখ্যা *
                </span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(e) => updateForm("stock", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  SKU
                </span>
                <input
                  maxLength={100}
                  value={form.sku}
                  onChange={(e) => updateForm("sku", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Category ID (ঐচ্ছিক)
                </span>
                <input
                  value={form.category_id}
                  onChange={(e) =>
                    updateForm("category_id", e.target.value)
                  }
                  placeholder="UUID"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  ওজন (গ্রাম)
                </span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.weight_grams}
                  onChange={(e) =>
                    updateForm("weight_grams", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Low stock alert threshold
                </span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.low_stock_threshold}
                  onChange={(e) =>
                    updateForm("low_stock_threshold", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium">
                  ছবির URL (প্রতি লাইনে একটি HTTPS URL)
                </span>
                <textarea
                  rows={3}
                  value={form.image_urls}
                  onChange={(e) => updateForm("image_urls", e.target.value)}
                  placeholder="https://example.com/product.jpg"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium">
                  ভিডিও URL (ঐচ্ছিক)
                </span>
                <input
                  type="url"
                  value={form.video_url}
                  onChange={(e) => updateForm("video_url", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium">
                  বিবরণ
                </span>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) =>
                    updateForm("description", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium">
                  Variants JSON
                </span>
                <textarea
                  rows={3}
                  value={form.variants}
                  onChange={(e) => updateForm("variants", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    updateForm("is_active", e.target.checked)
                  }
                />
                সক্রিয় পণ্য
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) =>
                    updateForm("is_featured", e.target.checked)
                  }
                />
                Featured পণ্য
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "সংরক্ষণ হচ্ছে..." : "পণ্য যোগ করুন"}
            </button>
          </form>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">পণ্যের তালিকা</h2>
            <p className="mt-1 text-sm text-gray-600">
              মোট পণ্য: {products.length}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50"
          >
            {loading ? "লোড হচ্ছে..." : "রিফ্রেশ"}
          </button>
        </div>

        {loading ? (
          <p className="py-6 text-gray-600">পণ্য লোড হচ্ছে...</p>
        ) : products.length === 0 ? (
          <p className="py-6 text-gray-600">
            কোনো পণ্য পাওয়া যায়নি।
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3">পণ্য</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">মূল্য</th>
                  <th className="p-3">স্টক</th>
                  <th className="p-3">অবস্থা</th>
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
                    <td className="p-3">{product.sku || "—"}</td>
                    <td className="p-3">
                      ৳{Number(product.price).toLocaleString("en-BD")}
                    </td>
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
                    <td className="p-3">
                      {product.is_active ? (
                        <span className="text-green-700">সক্রিয়</span>
                      ) : (
                        <span className="text-gray-500">নিষ্ক্রিয়</span>
                      )}
                    </td>
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