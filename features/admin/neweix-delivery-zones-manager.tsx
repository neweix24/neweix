"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BANGLADESH_ADMIN_AREAS } from "@/lib/bangladesh-admin";

type DeliveryZone = {
  id: string; zone_code: string; division_code: string; district_code: string;
  division_name: string; district_name: string; upazila_name: string; upazila_name_bn: string;
  delivery_fee: number | null; is_active: boolean; updated_at: string;
};

export default function NeweixDeliveryZonesManager() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});
  const [divisionCode, setDivisionCode] = useState("BD-D08");
  const [districtCode, setDistrictCode] = useState("BD-D08-Z62");
  const [upazilaCode, setUpazilaCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "fee" | "missing">("all");

  const division = useMemo(() => BANGLADESH_ADMIN_AREAS.find((item) => item.code === divisionCode), [divisionCode]);
  const districts = division?.districts ?? [];
  const district = districts.find((item) => item.code === districtCode);
  const upazilas = district?.upazilas ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/delivery-zones", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success || !Array.isArray(result.zones)) throw new Error(result?.error || "Could not load delivery zones.");
      setZones(result.zones as DeliveryZone[]);
      setFeeDrafts(Object.fromEntries((result.zones as DeliveryZone[]).map((zone) => [zone.id, zone.delivery_fee === null ? "" : String(zone.delivery_fee)])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load delivery zones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addZone() {
    if (!divisionCode || !districtCode || !upazilaCode) {
      setError("Select a division, district and upazila first.");
      return;
    }
    setAdding(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/delivery-zones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division_code: divisionCode, district_code: districtCode, upazila_code: upazilaCode }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "Could not add this delivery zone.");
      setMessage("The area is registered as inactive. Set its fee before activating it.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this area.");
    } finally {
      setAdding(false);
    }
  }

  async function save(zone: DeliveryZone, active = zone.is_active) {
    const raw = feeDrafts[zone.id] ?? "";
    const fee = raw.trim() === "" ? null : Number(raw);
    if (fee !== null && (!Number.isSafeInteger(fee) || fee < 0 || fee > 100000)) {
      setError("Enter a whole delivery fee between ৳0 and ৳100,000.");
      return;
    }
    if (active && fee === null) {
      setError("Set the actual delivery fee before activating this zone.");
      return;
    }
    setSavingId(zone.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/delivery-zones", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: zone.id, delivery_fee: fee, is_active: active }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "Could not save this delivery zone.");
      setMessage(zone.upazila_name + " delivery settings saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this delivery zone.");
    } finally {
      setSavingId("");
    }
  }

  const activeCount = zones.filter((zone) => zone.is_active).length;
  const configuredCount = zones.filter((zone) => zone.delivery_fee !== null).length;
  const missingFeeCount = zones.length - configuredCount;
  const filteredZones = zones.filter((zone) => {
    const term = search.trim().toLocaleLowerCase();
    const matchesSearch = !term || [zone.upazila_name, zone.upazila_name_bn, zone.district_name, zone.zone_code]
      .some((value) => value.toLocaleLowerCase().includes(term));
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "active" && zone.is_active)
      || (statusFilter === "fee" && !zone.is_active && zone.delivery_fee !== null)
      || (statusFilter === "missing" && zone.delivery_fee === null);
    return matchesSearch && matchesStatus;
  });

  const fieldClass = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl border border-red-300 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>{message}</p>}

      <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-xl font-bold">Add an expansion area</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Add an upazila from NEWEIX’s Bangladesh area list. It stays inactive until you configure and activate its actual delivery fee.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold">Division
            <select className={fieldClass + " mt-1"} value={divisionCode} disabled={adding || savingId !== ""} onChange={(event) => {
              const next = event.target.value;
              const nextDivision = BANGLADESH_ADMIN_AREAS.find((item) => item.code === next);
              const nextDistrict = nextDivision?.districts[0];
              setDivisionCode(next); setDistrictCode(nextDistrict?.code ?? ""); setUpazilaCode(nextDistrict?.upazilas[0]?.code ?? "");
            }}>
              {BANGLADESH_ADMIN_AREAS.map((item) => <option key={item.code} value={item.code}>{item.bn_name} · {item.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">District
            <select className={fieldClass + " mt-1"} value={districtCode} disabled={adding || savingId !== "" || !districts.length} onChange={(event) => {
              const next = districts.find((item) => item.code === event.target.value);
              setDistrictCode(event.target.value); setUpazilaCode(next?.upazilas[0]?.code ?? "");
            }}>
              {districts.map((item) => <option key={item.code} value={item.code}>{item.bn_name} · {item.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">Upazila
            <select className={fieldClass + " mt-1"} value={upazilaCode} disabled={adding || savingId !== "" || !upazilas.length} onChange={(event) => setUpazilaCode(event.target.value)}>
              {upazilas.map((item) => <option key={item.code} value={item.code}>{item.bn_name} · {item.name}</option>)}
            </select>
          </label>
        </div>
        <button type="button" onClick={() => void addZone()} disabled={loading || adding || savingId !== "" || !upazilaCode}
          className="mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "#267548" }}>
          {adding ? "Adding area…" : "Add inactive area"}
        </button>
      </section>

      <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">NEWEIX own delivery zones</h2>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--muted)" }}>
              Launch starts in Mymensingh district. Only areas configured here can use NEWEIX delivery; each fee is controlled independently from Pathao.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || Boolean(savingId) || adding} className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Refresh</button>
        </div>
        {loading ? <p className="text-sm" style={{ color: "var(--muted)" }}>Loading delivery zones…</p> : zones.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No own-delivery zones are configured.</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}><p className="text-xs" style={{ color: "var(--muted)" }}>Total areas</p><p className="mt-1 text-2xl font-bold">{zones.length}</p></div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}><p className="text-xs" style={{ color: "var(--muted)" }}>Active</p><p className="mt-1 text-2xl font-bold">{activeCount}</p></div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}><p className="text-xs" style={{ color: "var(--muted)" }}>Fee configured</p><p className="mt-1 text-2xl font-bold">{configuredCount}</p></div>
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}><p className="text-xs" style={{ color: "var(--muted)" }}>Fee missing</p><p className="mt-1 text-2xl font-bold">{missingFeeCount}</p></div>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
              <label className="text-xs font-semibold">Search area
                <input className={fieldClass + " mt-1"} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search upazila, district or zone code" />
              </label>
              <label className="text-xs font-semibold">Filter by status
                <select className={fieldClass + " mt-1"} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">All areas ({zones.length})</option>
                  <option value="active">Active ({activeCount})</option>
                  <option value="fee">Fee set · inactive ({configuredCount - activeCount})</option>
                  <option value="missing">Fee not set ({missingFeeCount})</option>
                </select>
              </label>
            </div>
            {filteredZones.length === 0 ? (
              <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>No areas match this search or status filter.</p>
            ) : <div className="space-y-3">
            {filteredZones.map((zone) => (
              <article key={zone.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_180px_auto_auto] sm:items-end" style={{ borderColor: "var(--border)" }}>
                <div>
                  <p className="text-sm font-bold">{zone.upazila_name_bn} · {zone.upazila_name}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{zone.district_name}, {zone.division_name} · {zone.zone_code}</p>
                  <p className="mt-1 text-xs" style={{ color: zone.is_active ? "#267548" : "var(--muted)" }}>
                    {zone.is_active ? "Active for checkout" : zone.delivery_fee === null ? "Fee not configured · unavailable" : "Fee configured · inactive"}
                  </p>
                </div>
                <label className="block text-xs font-semibold">Delivery fee (BDT)
                  <input className={fieldClass + " mt-1"} type="number" min="0" max="100000" step="1"
                    value={feeDrafts[zone.id] ?? ""}
                    onChange={(event) => setFeeDrafts((current) => ({ ...current, [zone.id]: event.target.value }))}
                    disabled={Boolean(savingId) || adding} placeholder="Enter actual fee" />
                </label>
                <button type="button" onClick={() => void save(zone)} disabled={Boolean(savingId) || loading || adding}
                  className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                  {savingId === zone.id ? "Saving…" : "Save fee"}
                </button>
                <button type="button" onClick={() => void save(zone, !zone.is_active)}
                  disabled={Boolean(savingId) || loading || adding || (!zone.is_active && !(feeDrafts[zone.id] ?? "").trim())}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: zone.is_active ? "#64748b" : "#267548" }}>
                  {zone.is_active ? "Pause zone" : "Activate zone"}
                </button>
              </article>
            ))}
            </div>}
          </>
        )}
      </section>
    </div>
  );
}
