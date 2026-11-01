"use client";

import { useState } from "react";
import Icon from "@/components/ui/icon";

type State = "idle" | "loading" | "success" | "error";

export default function PathaoPanel() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("Pathao API has not been tested yet.");
  const [environment, setEnvironment] = useState("");
  const [stores, setStores] = useState<unknown>(null);
  const [cities, setCities] = useState<unknown>(null);

  async function run(action: "status" | "stores" | "cities") {
    setState("loading");
    setMessage("Connecting to the Pathao API...");
    try {
      const response = await fetch(`/api/admin/pathao?action=${action}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pathao API request failed.");

      if (action === "status") {
        setEnvironment(result.environment || "");
        setMessage("Pathao credentials were found in Cloudflare.");
      } else if (action === "stores") {
        setStores(result.stores);
        setMessage("Pathao store list retrieved successfully.");
      } else {
        setCities(result.cities);
        setMessage("Pathao city list retrieved successfully.");
      }
      setState("success");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Pathao connection failed.");
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Pathao Courier Connection</h2>
          <p className="mt-1 text-sm text-gray-600">
            First verify the API credentials, then check Merchant Store and City information.
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">
          {state === "loading" ? "Testing" : state === "success" ? "Success" : state === "error" ? "Error" : "Not Tested"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void run("status")} disabled={state === "loading"} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Icon name="shield" size={16} /> Check Credentials
        </button>
        <button type="button" onClick={() => void run("stores")} disabled={state === "loading"} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          <Icon name="grid" size={16} /> Fetch Store List
        </button>
        <button type="button" onClick={() => void run("cities")} disabled={state === "loading"} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          <Icon name="map-pin" size={16} /> Fetch City List
        </button>
      </div>

      <p role="status" className={`mt-3 text-sm ${state === "error" ? "text-red-700" : state === "success" ? "text-green-700" : "text-gray-600"}`}>
        {message}
      </p>
      {environment && <p className="mt-1 text-xs text-gray-500">Environment: {environment}</p>}
      {stores !== null && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">View Pathao Store Response</summary><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(stores, null, 2)}</pre></details>}
      {cities !== null && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">View Pathao City Response</summary><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(cities, null, 2)}</pre></details>}
    </section>
  );
}
