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

type ProductForm = {
  name: string;
  slug: string;
  description: string;
  price: string;
  compare_at_price: string;
  stock: string;
  sku: string;
  category_id: string;
  image_urls: string;
  video_url: string;
  variants: string;
  weight_grams: string;
  low_stock_threshold: string;
  is_active: boolean;
  is_featured: boolean;
};

const emptyForm: ProductForm = {
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

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidNonNegativeNumber(value: number) {
  return Number.isFinite(value) && value >= 0;
}

export default function ProductsManager({ role }: Props) {
  const canManageProducts = role === "supreme" || role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>({ ...emptyForm });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<ProductForm>({ ...emptyForm });

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

  function updateForm<K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K]
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function updateEditForm<K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K]
  ) {
    setEditForm((previous) => ({ ...previous, [key]: value }));
  }

  function validateForm(values: ProductForm) {
    const price = Number(values.price);
    const compareAt =
      values.compare_at_price.trim() === ""
        ? null
        : Number(values.compare_at_price);
    const stock = Number(values.stock);
    const weight = Number(values.weight_grams);
    const threshold = Number(values.low_stock_threshold);

    if (!values.name.trim() || !values.slug.trim()) {
      return "পণ্যের নাম ও Slug দিতে হবে।";
    }

    if (!values.price.trim() || !isValidNonNegativeNumber(price)) {
      return "সঠিক মূল্য দিন।";
    }

    if (
      compareAt !== null &&
      !isValidNonNegativeNumber(compareAt)
    ) {
      return "আগের মূল্য সঠিক নয়।";
    }

    if (!Number.isInteger(stock) || !isValidNonNegativeNumber(stock)) {
      return "স্টক অবশ্যই শূন্য বা তার বেশি পূর্ণসংখ্যা হতে হবে।";
    }

    if (!Number.isInteger(weight) || !isValidNonNegativeNumber(weight)) {
      return "ওজন অবশ্যই শূন্য বা তার বেশি পূর্ণসংখ্যা হতে হবে।";
    }

    if (
      !Number.isInteger(threshold) ||
      !isValidNonNegativeNumber(threshold)
    ) {
      return "Low stock threshold সঠিক পূর্ণসংখ্যা হতে হবে।";
    }

    if (values.category_id.trim()) {
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!uuidPattern.test(values.category_id.trim())) {
        return "Category ID সঠিক UUID হতে হবে।";
      }
    }

    if (values.video_url.trim()) {
      try {
        const url = new URL(values.video_url.trim());
        if (url.protocol !== "https:") {
          return "ভিডিও URL অবশ্যই HTTPS হতে হবে।";
        }
      } catch {
        return "ভিডিও URL সঠিক নয়।";
      }
    }

    const imageUrls = values.image_urls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    for (const imageUrl of imageUrls) {
      try {
        const url = new URL(imageUrl);
        if (url.protocol !== "https:") {
          return "প্রতিটি ছবির URL অবশ্যই HTTPS হতে হবে।";
        }
      } catch {
        return "ছবির URL সঠিক নয়।";
      }
    }

    try {
      const variants = JSON.parse(values.variants);
      if (!Array.isArray(variants)) {
        return "Variants অবশ্যই JSON array হতে হবে।";
      }
    } catch {
      return "Variants JSON সঠিক নয়।";
    }

    return null;
  }

  function formToPayload(values: ProductForm) {
    return {
      name: values.name.trim(),
      slug: values.slug.trim(),
      description: values.description.trim() || null,
      price: Number(values.price),
      compare_at_price:
        values.compare_at_price.trim() === ""
          ? null
          : Number(values.compare_at_price),
      stock: Number(values.stock),
      sku: values.sku.trim() || null,
      category_id: values.category_id.trim() || null,
      image_urls: values.image_urls
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean),
      video_url: values.video_url.trim() || null,
      variants: JSON.parse(values.variants),
      weight_grams: Number(values.weight_grams),
      low_stock_threshold: Number(values.low_stock_threshold),
      is_active: values.is_active,
      is_featured: values.is_featured,
    };
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageProducts) {
      setError("আপনার পণ্য যোগ করার অনুমতি নেই।");
      return;
    }

    const validationError = validateForm(form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(form)),
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

  function startEdit(product: Product) {
    if (!canManageProducts) {
      setError("আপনার পণ্য সম্পাদনার অনুমতি নেই।");
      return;
    }

    setEditingProduct(product);

    setEditForm({
      name: product.name,
      slug: product.slug,
      description: product.description ?? "",
      price: String(product.price),
      compare_at_price:
        product.compare_at_price == null
          ? ""
          : String(product.compare_at_price),
      stock: String(product.stock),
      sku: product.sku ?? "",
      category_id: product.category_id ?? "",
      image_urls: Array.isArray(product.image_urls)
        ? product.image_urls.join("\n")
        : "",
      video_url: product.video_url ?? "",
      variants: JSON.stringify(product.variants ?? [], null, 2),
      weight_grams: String(product.weight_grams ?? 500),
      low_stock_threshold: String(product.low_stock_threshold ?? 5),
      is_active: product.is_active,
      is_featured: product.is_featured,
    });

    setError("");
    setNotice("");
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageProducts || !editingProduct) {
      setError("আপনার পণ্য সম্পাদনার অনুমতি নেই।");
      return;
    }

    const validationError = validateForm(editForm);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/products/${editingProduct.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formToPayload(editForm)),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "পণ্য আপডেট করা যায়নি।");
      }

      setEditingProduct(null);
      setEditForm({ ...emptyForm });
      setNotice("পণ্যের তথ্য সফলভাবে আপডেট হয়েছে।");

      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "পণ্য আপডেট করতে সমস্যা হয়েছে।"
      );
    } finally {
      setSaving(false);
    }
  }

  function renderProductForm(
    values: ProductForm,
    update: <K extends keyof ProductForm>(
      key: K,
      value: ProductForm[K]
    ) => void,
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void,
    submitLabel: string
  ) {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              পণ্যের নাম *
            </span>
            <input
              required
              maxLength={180}
              value={values.name}
              onChange={(e) => {
                const name = e.target.value;
                update("name", name);

                if (!values.slug || values.slug === makeSlug(values.name)) {
                  update("slug", makeSlug(name));
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Slug *</span>
            <input
              required
              maxLength={200}
              value={values.slug}
              onChange={(e) => update("slug", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">মূল্য *</span>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={values.price}
              onChange={(e) => update("price", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">আগের মূল্য</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.compare_at_price}
              onChange={(e) =>
                update("compare_at_price", e.target.value)
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">স্টক সংখ্যা *</span>
            <input
              required
              type="number"
              min="0"
              step="1"
              value={values.stock}
              onChange={(e) => update("stock", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">SKU</span>
            <input
              maxLength={100}
              value={values.sku}
              onChange={(e) => update("sku", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Category ID (ঐচ্ছিক)
            </span>
            <input
              value={values.category_id}
              onChange={(e) => update("category_id", e.target.value)}
              placeholder="UUID"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">ওজন (গ্রাম)</span>
            <input
              required
              type="number"
              min="0"
              step="1"
              value={values.weight_grams}
              onChange={(e) => update("weight_grams", e.target.value)}
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
              value={values.low_stock_threshold}
              onChange={(e) =>
                update("low_stock_threshold", e.target.value)
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
              value={values.image_urls}
              onChange={(e) => update("image_urls", e.target.value)}
              placeholder="https://example.com/product.jpg"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">ভিডিও URL</span>
            <input
              type="url"
              value={values.video_url}
              onChange={(e) => update("video_url", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">বিবরণ</span>
            <textarea
              rows={4}
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Variants JSON</span>
            <textarea
              rows={4}
              value={values.variants}
              onChange={(e) => update("variants", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
            />
            সক্রিয় পণ্য
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.is_featured}
              onChange={(e) => update("is_featured", e.target.checked)}
            />
            Featured পণ্য
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "সংরক্ষণ হচ্ছে..." : submitLabel}
        </button>
      </form>
    );
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
          {renderProductForm(
            form,
            updateForm,
            createProduct,
            "পণ্য যোগ করুন"
          )}
        </div>
      )}

      {canManageProducts && editingProduct && (
        <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">পণ্য সম্পাদনা করুন</h2>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditingProduct(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50"
            >
              বন্ধ করুন
            </button>
          </div>

          {renderProductForm(
            editForm,
            updateEditForm,
            saveProduct,
            "পরিবর্তন সংরক্ষণ"
          )}
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
          <p className="py-6 text-gray-600">কোনো পণ্য পাওয়া যায়নি।</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3">পণ্য</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">মূল্য</th>
                  <th className="p-3">স্টক</th>
                  <th className="p-3">অবস্থা</th>
                  <th className="p-3">কাজ</th>
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
                        <p className="mt-1 text-xs text-red-700">স্টক কম</p>
                      )}
                    </td>

                    <td className="p-3">
                      {product.is_active ? (
                        <span className="text-green-700">সক্রিয়</span>
                      ) : (
                        <span className="text-gray-500">নিষ্ক্রিয়</span>
                      )}
                    </td>

                    <td className="p-3">
                      {canManageProducts ? (
                        <button
                          type="button"
                          onClick={() => startEdit(product)}
                          className="rounded-lg border border-blue-300 px-3 py-2 text-blue-700 hover:bg-blue-50"
                        >
                          সম্পাদনা
                        </button>
                      ) : (
                        <span className="text-gray-400">শুধু দেখা</span>
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