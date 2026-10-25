"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_urls: string[] | null;
  stock: number;
  category_id: string | null;
  video_url: string | null;
  variants: unknown;
  sku: string | null;
  is_active: boolean;
  is_featured: boolean;
  weight_grams: number;
  low_stock_threshold: number;
  created_at: string;
};

type Props = {
  role: string;
};

export default function ProductsManager({ role }: Props) {
  const canCreate = role === "supreme" || role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [variants, setVariants] = useState("[]");
  const [weightGrams, setWeightGrams] = useState("500");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [isActive, setIsActive] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/products", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "পণ্য লোড করা যায়নি।");
      }

      setProducts(Array.isArray(result.products) ? result.products : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "সার্ভারে সমস্যা হয়েছে।"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function makeSlug(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!canCreate) {
      setError("আপনার পণ্য যোগ করার অনুমতি নেই।");
      return;
    }

    let parsedVariants: unknown;

    try {
      parsedVariants = JSON.parse(variants);

      if (!Array.isArray(parsedVariants)) {
        throw new Error("ভ্যারিয়েন্ট অবশ্যই JSON array হতে হবে।");
      }
    } catch {
      setError('ভ্যারিয়েন্টের JSON সঠিক নয়। উদাহরণ: []');
      return;
    }

    const productPrice = Number(price);
    const productStock = Number(stock);
    const comparePrice = compareAtPrice.trim()
      ? Number(compareAtPrice)
      : null;
    const weight = Number(weightGrams);
    const lowStock = Number(lowStockThreshold);

    if (!Number.isFinite(productPrice) || productPrice < 0) {
      setError("সঠিক মূল্য লিখুন।");
      return;
    }

    if (
      !Number.isSafeInteger(productStock) ||
      productStock < 0 ||
      productStock > 1000000
    ) {
      setError("সঠিক স্টক সংখ্যা লিখুন।");
      return;
    }

    if (
      comparePrice !== null &&
      (!Number.isFinite(comparePrice) || comparePrice < 0)
    ) {
      setError("আগের মূল্য সঠিকভাবে লিখুন।");
      return;
    }

    const slugValue = slug.trim() || makeSlug(name);

    if (!slugValue) {
      setError("ইংরেজি অক্ষরে একটি Slug লিখুন।");
      return;
    }

    const images = imageUrls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    setSaving(true);

    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          slug: slugValue,
          description: description.trim(),
          price: productPrice,
          compare_at_price: comparePrice,
          stock: productStock,
          sku: sku.trim() || null,
          category_id: categoryId.trim() || null,
          image_urls: images,
          video_url: videoUrl.trim() || null,
          variants: parsedVariants,
          weight_grams: weight,
          low_stock_threshold: lowStock,
          is_active: isActive,
          is_featured: isFeatured,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "পণ্য তৈরি করা যায়নি।");
      }

      setMessage("পণ্য সফলভাবে যোগ হয়েছে।");
      setName("");
      setSlug("");
      setDescription("");
      setPrice("");
      setCompareAtPrice("");
      setStock("0");
      setSku("");
      setCategoryId("");
      setImageUrls("");
      setVideoUrl("");
      setVariants("[]");
      setWeightGrams("500");
      setLowStockThreshold("5");
      setIsActive(false);
      setIsFeatured(false);

      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "সার্ভারে সমস্যা হয়েছে।"
      );
    } finally {
      setSaving(false);
    }
  }

  function formatPrice(value: number) {
    return new Intl.NumberFormat("bn-BD", {
      style: "currency",
      currency: "BDT",
      maximumFractionDigits: 2,
    }).format(value);
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100";

  return (
    <div className="space-y-8">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </p>
      )}

      {message && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800"
        >
          {message}
        </p>
      )}

      {canCreate && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="mb-6 text-xl font-bold">নতুন পণ্য যোগ করুন</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                পণ্যের নাম *
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(makeSlug(e.target.value));
                  }}
                  maxLength={200}
                  required
                  disabled={saving}
                  placeholder="যেমন: Wireless Headphones"
                />
              </label>

              <label className="block text-sm font-medium">
                Slug *
                <input
                  className={inputClass}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  maxLength={200}
                  required
                  disabled={saving}
                  placeholder="wireless-headphones"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  title="ইংরেজি ছোট অক্ষর, সংখ্যা ও হাইফেন ব্যবহার করুন"
                />
              </label>

              <label className="block text-sm font-medium">
                মূল্য (টাকা) *
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  disabled={saving}
                />
              </label>

              <label className="block text-sm font-medium">
                আগের মূল্য (ঐচ্ছিক)
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={compareAtPrice}
                  onChange={(e) => setCompareAtPrice(e.target.value)}
                  disabled={saving}
                />
              </label>

              <label className="block text-sm font-medium">
                স্টকের পরিমাণ *
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  required
                  disabled={saving}
                />
              </label>

              <label className="block text-sm font-medium">
                SKU (ঐচ্ছিক)
                <input
                  className={inputClass}
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  maxLength={100}
                  disabled={saving}
                />
              </label>

              <label className="block text-sm font-medium">
                ওজন (গ্রাম)
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  max="1000000"
                  value={weightGrams}
                  onChange={(e) => setWeightGrams(e.target.value)}
                  required
                  disabled={saving}
                />
              </label>

              <label className="block text-sm font-medium">
                Low stock সতর্কতার সীমা
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="1000000"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  required
                  disabled={saving}
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              পণ্যের বিবরণ
              <textarea
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={10000}
                disabled={saving}
              />
            </label>

            <label className="block text-sm font-medium">
              ছবির HTTPS লিংক (প্রতি লাইনে একটি)
              <textarea
                className={inputClass}
                value={imageUrls}
                onChange={(e) => setImageUrls(e.target.value)}
                rows={3}
                placeholder={"https://example.com/product.jpg"}
                disabled={saving}
              />
            </label>

            <label className="block text-sm font-medium">
              ভিডিওর HTTPS লিংক (ঐচ্ছিক)
              <input
                className={inputClass}
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://example.com/video"
                disabled={saving}
              />
            </label>

            <label className="block text-sm font-medium">
              Category ID (ঐচ্ছিক UUID)
              <input
                className={inputClass}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                placeholder="ডেটাবেসের Category UUID"
                disabled={saving}
              />
            </label>

            <label className="block text-sm font-medium">
              Variants (JSON array)
              <textarea
                className={inputClass}
                value={variants}
                onChange={(e) => setVariants(e.target.value)}
                rows={3}
                disabled={saving}
                spellCheck={false}
              />
              <span className="mt-1 block text-xs text-gray-500">
                আপাতত ভ্যারিয়েন্ট না থাকলে [] রাখুন।
              </span>
            </label>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={saving}
                />
                দোকানে প্রকাশ করুন
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  disabled={saving}
                />
                Featured পণ্য
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "পণ্য যোগ হচ্ছে..." : "পণ্য যোগ করুন"}
            </button>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">পণ্যের তালিকা</h2>
            <p className="mt-1 text-sm text-gray-500">
              মোট পণ্য: {products.length}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? "লোড হচ্ছে..." : "তালিকা রিফ্রেশ"}
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-gray-500">পণ্যের তালিকা লোড হচ্ছে...</p>
        ) : products.length === 0 ? (
          <p className="py-8 text-gray-500">
            কোনো পণ্য পাওয়া যায়নি। নতুন পণ্য যোগ করতে উপরের ফর্ম ব্যবহার করুন।
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="px-3 py-3">পণ্য</th>
                  <th className="px-3 py-3">মূল্য</th>
                  <th className="px-3 py-3">স্টক</th>
                  <th className="px-3 py-3">অবস্থা</th>
                  <th className="px-3 py-3">SKU</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100">
                    <td className="px-3 py-4">
                      <p className="font-semibold">{product.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        /{product.slug}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      {formatPrice(Number(product.price))}
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={
                          product.stock <= product.low_stock_threshold
                            ? "font-semibold text-red-700"
                            : ""
                        }
                      >
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      {product.is_active ? "প্রকাশিত" : "খসড়া"}
                      {product.is_featured ? " · Featured" : ""}
                    </td>
                    <td className="px-3 py-4">{product.sku || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}