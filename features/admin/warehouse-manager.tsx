"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type StoreDiagnostic = {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  is_active: boolean;
  configured_store_id: number | null;
  status: "verified" | "not_configured" | "not_found";
  merchant_store_name: string | null;
  detail: string;
};

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
  const [diagnostics, setDiagnostics] = useState<StoreDiagnostic[]>([]);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [diagnosticsCheckedAt, setDiagnosticsCheckedAt] = useState("");
  const [diagnosticsError, setDiagnosticsError] = useState("");

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
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


  async function configureOrigin(warehouse: Warehouse) {
    const address = window.prompt("Enter the actual dispatch address:", warehouse.address ?? "");
    if (address === null) return;
    const storeValue = window.prompt("Enter this origin's Pathao Store ID:", warehouse.pathao_store_id ? String(warehouse.pathao_store_id) : "");
    if (storeValue === null) return;
    const contactPhone = window.prompt("Enter warehouse contact phone:", warehouse.contact_phone ?? "");
    if (contactPhone === null) return;
    const storeId = storeValue.trim() ? Number(storeValue.trim()) : null;
    if (storeId !== null && (!Number.isSafeInteger(storeId) || storeId < 1)) {
      setError("Pathao Store ID must be a positive integer.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/warehouses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: warehouse.id, address: address.trim(), pathao_store_id: storeId, contact_phone: contactPhone.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update dispatch origin.");
      setMessage("Dispatch address and Pathao Store ID saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update dispatch origin.");
    } finally {
      setSaving(false);
    }
  }

  async function checkPathaoStores() {
    setDiagnosticsBusy(true);
    setDiagnosticsError("");
    try {
      const response = await fetch("/api/admin/warehouses/pathao-diagnostics", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not verify warehouse Pathao Store IDs.");
      setDiagnostics(Array.isArray(data.results) ? data.results : []);
      setDiagnosticsCheckedAt(typeof data.checkedAt === "string" ? data.checkedAt : "");
    } catch (cause) {
      setDiagnosticsError(cause instanceof Error ? cause.message : "Could not verify warehouse Pathao Store IDs.");
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  const inputClass = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Dispatch locations</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Mymensingh is the business headquarters. Add each physical dispatch point separately.</p>
          </div>
          <button type="button" onClick={() => void checkPathaoStores()} disabled={diagnosticsBusy || loading || warehouses.length === 0} className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
            {diagnosticsBusy ? "Checking merchant stores…" : "Verify Pathao Store IDs"}
          </button>
        </div>
        {diagnosticsCheckedAt && <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>Last checked: {new Date(diagnosticsCheckedAt).toLocaleString()}</p>}
        {diagnosticsError && <p role="alert" className="mb-3 rounded-xl border border-red-300 p-3 text-sm text-red-700">{diagnosticsError}</p>}
        {diagnostics.length > 0 && (
          <div className="mb-4 space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-semibold">Pathao merchant account verification</p>
            {diagnostics.map((item) => (
              <div key={item.warehouse_id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <span>{item.warehouse_name} · Store ID {item.configured_store_id ?? "not configured"}</span>
                <span className={item.status === "verified" ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                  {item.status === "verified" ? "Verified" : item.status === "not_found" ? "Not found" : "Not configured"}
                </span>
                <p className="w-full text-xs" style={{ color: "var(--muted)" }}>{item.detail}{item.merchant_store_name ? ` Merchant name: ${item.merchant_store_name}.` : ""}</p>
              </div>
            ))}
          </div>
        )}
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void configureOrigin(warehouse)} disabled={saving} className="rounded-lg border px-3 py-2 text-xs font-semibold">Configure dispatch origin</button>
                  <button type="button" onClick={() => void toggleWarehouse(warehouse)} className="rounded-lg border px-3 py-2 text-xs font-semibold">
                    {warehouse.is_active ? "Deactivate location" : "Activate location"}
                  </button>
                </div>
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
