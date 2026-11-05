"use client";

import { useState, type FormEvent } from "react";
import Icon from "@/components/ui/icon";

type State = "idle" | "loading" | "success" | "error";
type LocationOption = { id: number; name: string; available?: boolean };

function extractOptions(payload: unknown, idKeys: string[], nameKeys: string[]): LocationOption[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : {};
  const rows = Array.isArray(data.data) ? data.data : Array.isArray(root.data) ? root.data : Array.isArray(root.locations) ? root.locations : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const rawId = idKeys.map((key) => item[key]).find((value) => value !== undefined);
    const rawName = nameKeys.map((key) => item[key]).find((value) => typeof value === "string");
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1 || typeof rawName !== "string") return [];
    return [{ id, name: rawName, available: typeof item.home_delivery_available === "boolean" ? item.home_delivery_available : undefined }];
  });
}

export default function PathaoPanel() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("Pathao API has not been tested yet.");
  const [environment, setEnvironment] = useState("");
  const [stores, setStores] = useState<unknown>(null);
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [zones, setZones] = useState<LocationOption[]>([]);
  const [areas, setAreas] = useState<LocationOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [cityId, setCityId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [itemType, setItemType] = useState("2");
  const [deliveryType, setDeliveryType] = useState("48");
  const [weight, setWeight] = useState("0.5");
  const [quote, setQuote] = useState<unknown>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [consignmentId, setConsignmentId] = useState("");
  const [tracking, setTracking] = useState<unknown>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  async function getJson(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Pathao API request failed.");
    return result;
  }

  async function run(action: "status" | "stores" | "cities") {
    setState("loading");
    setMessage("Connecting to the Pathao API...");
    try {
      const result = await getJson(`/api/admin/pathao?action=${action}`);
      if (action === "status") {
        setEnvironment(result.environment || "");
        setMessage("Pathao credentials were found and authentication succeeded.");
      } else if (action === "stores") {
        setStores(result.stores);
        setMessage("Pathao store list retrieved successfully. Enter your pickup store ID below.");
      } else {
        setCities(extractOptions(result.cities, ["city_id", "cityId", "id"], ["city_name", "cityName", "name"]));
        setMessage("Pathao city list retrieved successfully.");
      }
      setState("success");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Pathao connection failed.");
    }
  }

  async function loadZones(nextCityId: string) {
    setCityId(nextCityId);
    setZoneId("");
    setAreaId("");
    setZones([]);
    setAreas([]);
    if (!nextCityId) return;
    try {
      const result = await getJson(`/api/admin/pathao?action=zones&cityId=${encodeURIComponent(nextCityId)}`);
      setZones(extractOptions(result.locations, ["zone_id", "zoneId", "id"], ["zone_name", "zoneName", "name"]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Pathao zones.");
      setState("error");
    }
  }

  async function loadAreas(nextZoneId: string) {
    setZoneId(nextZoneId);
    setAreaId("");
    setAreas([]);
    if (!nextZoneId) return;
    try {
      const result = await getJson(`/api/admin/pathao?action=areas&zoneId=${encodeURIComponent(nextZoneId)}`);
      setAreas(extractOptions(result.locations, ["area_id", "areaId", "id"], ["area_name", "areaName", "name"]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Pathao areas.");
      setState("error");
    }
  }


  async function trackShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTrackingLoading(true);
    setTracking(null);
    try {
      const result = await getJson(`/api/admin/pathao?action=track&consignmentId=${encodeURIComponent(consignmentId.trim())}`);
      setTracking(result);
      setMessage(result.synced
        ? "Pathao status retrieved and NEWEIX order status synchronized."
        : "Pathao status retrieved. No local status change was needed.");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not retrieve Pathao shipment status.");
      setState("error");
    } finally {
      setTrackingLoading(false);
    }
  }

  async function calculatePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuoteLoading(true);
    setQuote(null);
    try {
      const response = await fetch("/api/admin/pathao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action: "calculate_price",
          storeId: Number(storeId),
          itemType: Number(itemType),
          deliveryType: Number(deliveryType),
          itemWeightKg: Number(weight),
          recipientCity: cityId ? Number(cityId) : undefined,
          recipientZone: zoneId ? Number(zoneId) : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pathao price calculation failed.");
      setQuote(result.quote);
      setMessage("Live delivery charge received from Pathao.");
      setState("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pathao price calculation failed.");
      setState("error");
    } finally {
      setQuoteLoading(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Pathao Courier Management</h2>
          <p className="mt-1 text-sm text-gray-600">Verify the merchant connection, inspect pickup stores and calculate live delivery charges.</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">
          {state === "loading" || quoteLoading ? "Testing" : state === "success" ? "Connected" : state === "error" ? "Action required" : "Not Tested"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void run("status")} disabled={state === "loading"} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Icon name="shield" size={16} /> Check Credentials</button>
        <button type="button" onClick={() => void run("stores")} disabled={state === "loading"} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"><Icon name="grid" size={16} /> Fetch Store List</button>
        <button type="button" onClick={() => void run("cities")} disabled={state === "loading"} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"><Icon name="map-pin" size={16} /> Fetch Cities</button>
      </div>
      <p role="status" className={`mt-3 text-sm ${state === "error" ? "text-red-700" : state === "success" ? "text-green-700" : "text-gray-600"}`}>{message}</p>
      {environment && <p className="mt-1 text-xs text-gray-500">Environment: {environment}</p>}


      <form onSubmit={trackShipment} className="mt-5 space-y-3 rounded-xl border border-gray-200 p-4">
        <div>
          <h3 className="font-semibold">Shipment Tracking & Status Sync</h3>
          <p className="mt-1 text-xs text-gray-500">Fetch the latest status from Pathao. NEWEIX applies only supported, valid order-state transitions.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input required minLength={3} maxLength={80} value={consignmentId} onChange={(event) => setConsignmentId(event.target.value)} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="Pathao Consignment ID" />
          <button type="submit" disabled={trackingLoading || !consignmentId.trim()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{trackingLoading ? "Checking..." : "Track Shipment"}</button>
        </div>
        {tracking !== null && <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(tracking, null, 2)}</pre>}
      </form>

      <form onSubmit={calculatePrice} className="mt-5 space-y-4 rounded-xl border border-gray-200 p-4">
        <div>
          <h3 className="font-semibold">Live Delivery Charge Calculator</h3>
          <p className="mt-1 text-xs text-gray-500">The quote comes from the Pathao price-plan API; it is not a locally estimated fee.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Pickup Store ID
            <input required inputMode="numeric" pattern="[0-9]+" value={storeId} onChange={(event) => setStoreId(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Pathao store ID" />
          </label>
          <label className="text-sm font-medium">Parcel weight (kg)
            <input required type="number" min="0.5" max="10" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm font-medium">Product type
            <select value={itemType} onChange={(event) => setItemType(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="2">Parcel</option><option value="1">Document</option></select>
          </label>
          <label className="text-sm font-medium">Delivery type
            <select value={deliveryType} onChange={(event) => setDeliveryType(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="48">Normal delivery</option><option value="12">On-demand delivery</option></select>
          </label>
          <label className="text-sm font-medium">Destination city
            <select value={cityId} onChange={(event) => void loadZones(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Select city (optional)</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select>
          </label>
          <label className="text-sm font-medium">Destination zone
            <select value={zoneId} onChange={(event) => void loadAreas(event.target.value)} disabled={!cityId} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Select zone (optional)</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">Destination area
            <select value={areaId} onChange={(event) => setAreaId(event.target.value)} disabled={!zoneId} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">Select area (optional)</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}{area.available === false ? " (Home delivery unavailable)" : ""}</option>)}</select>
          </label>
        </div>
        <button type="submit" disabled={quoteLoading || !storeId || !weight} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{quoteLoading ? "Calculating..." : "Calculate Pathao Charge"}</button>
        {quote !== null && <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(quote, null, 2)}</pre>}
      </form>

      <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
        <h3 className="text-sm font-bold text-emerald-950">Automatic shipment updates (Webhook)</h3>
        <p className="mt-1 text-xs leading-5 text-emerald-900">Callback URL for Pathao Merchant Panel → Developer API → Webhook Integration:</p>
        <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs text-gray-800">https://neweix.com/api/webhooks/pathao</code>
        <p className="mt-2 text-xs leading-5 text-emerald-900">Keep PATHAO_WEBHOOK_SECRET in Cloudflare Worker secrets. Never expose merchant credentials or webhook secrets in browser code. NEWEIX treats webhook events as signals and verifies shipment state with Pathao before applying updates.</p>
      </div>
      {stores !== null && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">View Pathao Store Response</summary><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(stores, null, 2)}</pre></details>}
      {cities.length > 0 && <p className="mt-3 text-xs text-gray-500">{cities.length} Pathao cities loaded. Select a city to load zones and areas.</p>}
    </section>
  );
}
