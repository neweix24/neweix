"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { inferProductCategory } from "@/features/admin/product-category-inference";
import Icon from "@/components/ui/icon";

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

type Category = { id: string; name: string; slug: string };

type Props = { role: Role };

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
  weight_grams: "500",
  low_stock_threshold: "5",
  is_active: true,
  is_featured: false,
};

export default function ProductsManager({ role }: Props) {
  const canManageProducts = role === "supreme" || role === "admin";
  const isStaff = role === "staff";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categorySelectionMode, setCategorySelectionMode] = useState<"auto" | "manual">("auto");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const inferredCategory = categorySelectionMode === "auto"
    ? inferProductCategory(form.name, categories)
    : null;

  const loadProducts = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/products", {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the product list.");
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    let active = true;
    fetch("/api/categories", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load categories.");
        if (active) setCategories(Array.isArray(data.categories) ? data.categories : []);
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load categories."); });
    return () => { active = false; };
  }, [loadProducts]);

  function updateField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const name = form.name.trim();
    const categoryForSubmit = categorySelectionMode === "auto"
      ? inferProductCategory(name, categories)
      : null;
    const slug = form.slug.trim().toLowerCase();
    const price = Number(form.price);
    const stock = Number(form.stock);
    const compareAt = form.compare_at_price.trim() ? Number(form.compare_at_price) : null;
    const weight = Number(form.weight_grams);
    const threshold = Number(form.low_stock_threshold);
    const imageUrls = form.image_urls.split("\n").map((item) => item.trim()).filter(Boolean);

    if (name.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError("Enter a product name and a valid English slug.");
      return;
    }
    if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(stock) || stock < 0) {
      setError("Enter a valid price and stock quantity.");
      return;
    }
    if (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < 0)) {
      setError("The compare-at price is invalid.");
      return;
    }
    if (!Number.isSafeInteger(weight) || weight < 1 || !Number.isSafeInteger(threshold) || threshold < 0) {
      setError("Enter a valid weight and low-stock threshold.");
      return;
    }
    if (imageUrls.length > 10 || imageUrls.some((url) => {
      try { return new URL(url).protocol !== "https:"; } catch { return true; }
    })) {
      setError("Provide up to 10 valid HTTPS image URLs.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, slug, description: form.description.trim(), price,
          compare_at_price: compareAt, stock, sku: form.sku.trim() || null,
          category_id: categorySelectionMode === "auto"
            ? categoryForSubmit?.id ?? null
            : form.category_id || null,
          image_urls: imageUrls, video_url: form.video_url.trim() || null,
          variants: [], weight_grams: weight, low_stock_threshold: threshold,
          is_active: form.is_active, is_featured: form.is_featured,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create the product.");
      setForm(emptyForm);
      setCategoryQuery("");
      setCategorySelectionMode("auto");
      setShowForm(false);
      setNotice("New product created successfully.");
      await loadProducts(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-950/40 p-4 text-red-200">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-emerald-200">{notice}</div>}

      <div className="rounded-2xl border p-4 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Products & Stock</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Total products: {products.length}</p>
            {isStaff && <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Your account has view-only access to product and stock information.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadProducts(true)} disabled={loading || refreshing} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--border)" }}><><Icon name="refresh" size={16} /> {refreshing ? "Refreshing…" : "Refresh"}</></button>
            {canManageProducts && <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-xl px-4 py-2 text-sm font-bold" style={{ background: "var(--primary)", color: "#080b09" }}><><Icon name={showForm ? "close" : "plus"} size={16} /> {showForm ? "Close Form" : "New Product"}</></button>}
          </div>
        </div>

        {canManageProducts && showForm && (
          <form onSubmit={createProduct} className="mb-7 grid gap-4 rounded-xl border p-4 sm:grid-cols-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <div className="sm:col-span-2"><h3 className="text-lg font-bold">Add New Product</h3><p className="text-sm" style={{ color: "var(--muted)" }}>This form uses the existing POST /api/admin/products API.</p></div>
            <label className="grid gap-1 text-sm">Product Name *<input required minLength={2} maxLength={200} value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g. Premium Cotton Polo Shirt" className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="grid gap-1 text-sm">Slug *<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(e) => updateField("slug", e.target.value.toLowerCase())} placeholder="sample-product" className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="grid gap-1 text-sm">Price (BDT) *<input required type="number" min="0" step="1" value={form.price} onChange={(e) => updateField("price", e.target.value)} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="grid gap-1 text-sm">Stock *<input required type="number" min="0" step="1" value={form.stock} onChange={(e) => updateField("stock", e.target.value)} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="grid gap-1 text-sm">Compare-at Price (optional)<input type="number" min="0" step="1" value={form.compare_at_price} onChange={(e) => updateField("compare_at_price", e.target.value)} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="grid gap-1 text-sm">SKU<input maxLength={100} value={form.sku} onChange={(e) => updateField("sku", e.target.value)} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <div className="grid gap-1 text-sm"><div className="flex items-center justify-between gap-2"><label htmlFor="product-category">Category</label><button type="button" onClick={() => { setCategorySelectionMode("auto"); setCategoryQuery(""); updateField("category_id", ""); }} className="text-xs font-semibold underline"><Icon name="refresh" size={14} /> Auto-detect from Name</button></div><input id="product-category" list="neweix-product-categories" autoComplete="off" value={categorySelectionMode === "auto" ? inferredCategory?.name ?? "" : categoryQuery} onChange={(e) => { const value = e.target.value; setCategoryQuery(value); setCategorySelectionMode("manual"); const match = categories.find((item) => item.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase() || item.slug === value.trim().toLowerCase()); updateField("category_id", match?.id ?? ""); }} placeholder="Enter a category name…" className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /><datalist id="neweix-product-categories">{categories.map((category) => <option key={category.id} value={category.name} />)}</datalist><span className="text-xs" style={{ color: "var(--muted)" }}>{categorySelectionMode === "auto" ? inferredCategory ? "Category was automatically selected based on the product name." : "The category will be auto-filled when a reliable match is found; otherwise, choose from the list." : form.category_id ? "Category selected manually." : "Select an existing category from the list."}</span></div>
            <label className="grid gap-1 text-sm sm:col-span-2">Description<textarea rows={3} maxLength={10000} value={form.description} onChange={(e) => updateField("description", e.target.value)} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="grid gap-1 text-sm sm:col-span-2">HTTPS Image URLs (one per line, up to 10)<textarea rows={3} value={form.image_urls} onChange={(e) => updateField("image_urls", e.target.value)} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="grid gap-1 text-sm sm:col-span-2">Video URL (optional)<input type="url" value={form.video_url} onChange={(e) => updateField("video_url", e.target.value)} placeholder="https://www.youtube.com/watch?v=aqz-KE-bpKQ" className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /><span className="text-xs" style={{ color: "var(--muted)" }}>Demo YouTube link: https://www.youtube.com/watch?v=aqz-KE-bpKQ — replace it with your product video URL.</span></label>
            <label className="grid gap-1 text-sm">Weight (grams)<input required type="number" min="1" value={form.weight_grams} onChange={(e) => updateField("weight_grams", e.target.value)} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="grid gap-1 text-sm">Low stock threshold<input required type="number" min="0" value={form.low_stock_threshold} onChange={(e) => updateField("low_stock_threshold", e.target.value)} className="rounded-lg border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => updateField("is_active", e.target.checked)} /> Keep Product Active</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={(e) => updateField("is_featured", e.target.checked)} /> Featured Product</label>
            <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={saving} className="rounded-xl px-5 py-3 font-bold disabled:opacity-50" style={{ background: "var(--primary)", color: "#080b09" }}><><Icon name={saving ? "refresh" : "check"} size={17} /> {saving ? "Saving…" : "Create Product"}</></button><button type="button" onClick={() => { setForm(emptyForm); setCategoryQuery(""); setCategorySelectionMode("auto"); }} className="rounded-xl border px-5 py-3" style={{ borderColor: "var(--border)" }}><Icon name="refresh" size={15} /> Reset Form</button></div>
          </form>
        )}

        {loading ? <p className="py-6" style={{ color: "var(--muted)" }}>Loading products…</p> : products.length === 0 ? <p className="py-6" style={{ color: "var(--muted)" }}>No products found.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr className="border-b" style={{ borderColor: "var(--border)", color: "var(--muted)" }}><th className="p-3">Product</th>{!isStaff && <><th className="p-3">SKU</th><th className="p-3">Price</th><th className="p-3">Status</th></>}<th className="p-3">Stock</th></tr></thead>
              <tbody>{products.map((product) => <tr key={product.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="p-3"><p className="font-semibold">{product.name}</p><p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{product.slug}</p></td>
                {!isStaff && <><td className="p-3">{product.sku || "—"}</td><td className="p-3">৳{Number(product.price ?? 0).toLocaleString("en-BD")}</td><td className="p-3">{product.is_active ? "Active" : "Inactive"}</td></>}
                <td className="p-3"><span className={product.stock <= product.low_stock_threshold ? "font-bold text-red-400" : ""}>{product.stock}</span>{product.stock <= product.low_stock_threshold && <p className="mt-1 text-xs text-red-400">Low Stock</p>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
