"use client";

import { useEffect, useState } from "react";

type Warehouse = {
  id: string; code: string; name: string; city: string; district: string; division: string;
  address: string | null; contact_name: string | null; contact_phone: string | null;
  pathao_store_id: number | null; is_primary: boolean; is_active: boolean;
  inventory: { skuCount: number; units: number; reserved: number };
};

const emptyForm = {
  code: "", name: "", city: "", district: "", division: "", address: "",
  contact_name: "", contact_phone: "", pathao_store_id: "",
};

export default function WarehouseManager() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/warehouses", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load warehouses.");
      setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load warehouses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createWarehouse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          pathao_store_id: form.pathao_store_id ? Number(form.pathao_store_id) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create warehouse.");
      setForm(emptyForm);
      setMessage("Warehouse created. Add the complete dispatch address and Pathao Store ID before using it for courier bookings.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create warehouse.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleWarehouse(warehouse: Warehouse) {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/warehouses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: warehouse.id, is_active: !warehouse.is_active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update warehouse.");
      setMessage(`${warehouse.name} is now ${!warehouse.is_active ? "active" : "inactive"}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update warehouse.");
    }
  }

  const inputClass = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="mb-4">
          <h2 className="text-xl font-bold">Dispatch locations</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Mymensingh is the business headquarters. Add each physical dispatch point separately.</p>
        </div>
        {loading ? <p className="text-sm">Loading warehouses…</p> : warehouses.length === 0 ? <p className="text-sm">No warehouse records found.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {warehouses.map((warehouse) => (
              <article key={warehouse.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{warehouse.name}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{warehouse.code} · {warehouse.city}, {warehouse.district}</p>
                  </div>
                  <span className="rounded-full border px-2 py-1 text-xs">{warehouse.is_active ? "Active" : "Inactive"}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg p-2" style={{ background: "var(--bg)" }}><p className="text-lg font-bold">{warehouse.inventory.skuCount}</p><p className="text-[11px]" style={{ color: "var(--muted)" }}>SKUs</p></div>
                  <div className="rounded-lg p-2" style={{ background: "var(--bg)" }}><p className="text-lg font-bold">{warehouse.inventory.units}</p><p className="text-[11px]" style={{ color: "var(--muted)" }}>Units</p></div>
                  <div className="rounded-lg p-2" style={{ background: "var(--bg)" }}><p className="text-lg font-bold">{warehouse.inventory.reserved}</p><p className="text-[11px]" style={{ color: "var(--muted)" }}>Reserved</p></div>
                </div>
                <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                  {warehouse.address || "Dispatch address not configured"} · Pathao Store: {warehouse.pathao_store_id ?? "Not configured"}
                </p>
                <button type="button" onClick={() => void toggleWarehouse(warehouse)} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold">
                  {warehouse.is_active ? "Deactivate location" : "Activate location"}
                </button>
                {warehouse.is_primary && <p className="mt-2 text-xs font-semibold text-emerald-700">Primary business headquarters</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-xl font-bold">Add dispatch location</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Enter the actual warehouse city and dispatch details. Do not use the customer destination as the origin.</p>
        <form onSubmit={createWarehouse} className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ["code", "Warehouse code", "e.g. DHAKA-DC"],
            ["name", "Warehouse name", "e.g. NEWEIX Dhaka Dispatch"],
            ["city", "City", "Dhaka"],
            ["district", "District", "Dhaka"],
            ["division", "Division", "Dhaka"],
            ["address", "Full dispatch address", "Street, area, thana, district"],
            ["contact_name", "Contact person", "Warehouse manager"],
            ["contact_phone", "Contact phone", "01XXXXXXXXX"],
            ["pathao_store_id", "Pathao Store ID", "Merchant store ID for this origin"],
          ] as const).map(([key, label, placeholder]) => (
            <label key={key} className="space-y-1 text-sm font-medium">
              {label}
              <input
                className={inputClass}
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                placeholder={placeholder}
                required={["code", "name", "city", "district", "division"].includes(key)}
                maxLength={key === "address" ? 500 : 120}
                inputMode={key === "pathao_store_id" || key === "contact_phone" ? "numeric" : "text"}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
              {saving ? "Saving…" : "Add warehouse"}
            </button>
          </div>
        </form>
      </section>

      {message && <p role="status" className="rounded-xl border p-3 text-sm">{message}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-300 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
