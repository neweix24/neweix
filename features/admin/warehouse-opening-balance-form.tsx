"use client";

import { useEffect, useState, type FormEvent } from "react";

type Warehouse = { id: string; code: string; name: string; city: string };
type Product = { id: string; name: string; slug: string; stock: number };
type Options = { warehouses: Warehouse[]; products: Product[] };

export default function WarehouseOpeningBalanceForm() {
  const [options, setOptions] = useState<Options>({ warehouses: [], products: [] });
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadOptions() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/warehouses/inventory/opening-balance", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load products and warehouses.");
      const next = { warehouses: data.warehouses ?? [], products: data.products ?? [] } as Options;
      setOptions(next);
      setWarehouseId((current) => current || next.warehouses[0]?.id || "");
      setProductId((current) => current || next.products[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load options.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadOptions(); }, []);

  const selectedProduct = options.products.find((product) => product.id === productId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/warehouses/inventory/opening-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_id: warehouseId,
          product_id: productId,
          quantity: Number(quantity),
          note,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record opening balance.");
      setMessage("Opening stock recorded and added to the inventory movement ledger.");
      setQuantity("");
      setNote("");
      await loadOptions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record opening balance.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
  return (
    <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="text-xl font-bold">Record physical opening stock</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Enter the physically counted units at one dispatch location. Each product can receive only one opening-balance entry per warehouse.
      </p>
      <div className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
        <strong>Important:</strong> Legacy product stock is shown for reference only. It is not copied into this warehouse. Count the actual units at the selected location before submitting.
      </div>
      {loading ? <p className="mt-4 text-sm">Loading product list…</p> : (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Dispatch warehouse
            <select className={inputClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required>
              {options.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.city} ({warehouse.code})</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Product
            <select className={inputClass} value={productId} onChange={(event) => setProductId(event.target.value)} required>
              {options.products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.slug})</option>)}
            </select>
          </label>
          {selectedProduct && (
            <p className="sm:col-span-2 text-xs" style={{ color: "var(--muted)" }}>
              Existing central product.stock reference: {selectedProduct.stock} units — not automatically assigned to any warehouse.
            </p>
          )}
          <label className="space-y-1 text-sm font-medium">
            Physically counted quantity
            <input className={inputClass} type="number" min="0" max="1000000" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Count note / evidence
            <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} minLength={5} maxLength={500} placeholder="e.g. Physical count verified on 06 Nov 2026" required />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving || loading || !warehouseId || !productId} className="rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
              {saving ? "Recording…" : "Record opening stock"}
            </button>
          </div>
        </form>
      )}
      {message && <p role="status" className="mt-3 rounded-xl border p-3 text-sm">{message}</p>}
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-300 p-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
