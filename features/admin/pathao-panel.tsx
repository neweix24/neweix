"use client";

import { useState } from "react";
import Icon from "@/components/ui/icon";

type State = "idle" | "loading" | "success" | "error";

export default function PathaoPanel() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("এখনো Pathao API পরীক্ষা করা হয়নি।");
  const [environment, setEnvironment] = useState("");
  const [stores, setStores] = useState<unknown>(null);
  const [cities, setCities] = useState<unknown>(null);

  async function run(action: "status" | "stores" | "cities") {
    setState("loading");
    setMessage("Pathao API-এর সঙ্গে যোগাযোগ করা হচ্ছে...");
    try {
      const response = await fetch(`/api/admin/pathao?action=${action}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pathao API অনুরোধ ব্যর্থ।");

      if (action === "status") {
        setEnvironment(result.environment || "");
        setMessage("Cloudflare-এ Pathao credentials পাওয়া গেছে।");
      } else if (action === "stores") {
        setStores(result.stores);
        setMessage("Pathao Store List সফলভাবে পাওয়া গেছে।");
      } else {
        setCities(result.cities);
        setMessage("Pathao City List সফলভাবে পাওয়া গেছে।");
      }
      setState("success");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Pathao সংযোগ ব্যর্থ।");
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Pathao Courier সংযোগ</h2>
          <p className="mt-1 text-sm text-gray-600">
            প্রথমে API credentials পরীক্ষা করুন, এরপর Merchant Store ও City তথ্য যাচাই করুন।
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">
          {state === "loading" ? "পরীক্ষা চলছে" : state === "success" ? "সফল" : state === "error" ? "সমস্যা" : "পরীক্ষা বাকি"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void run("status")} disabled={state === "loading"} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Icon name="shield" size={16} /> Credentials পরীক্ষা
        </button>
        <button type="button" onClick={() => void run("stores")} disabled={state === "loading"} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          <Icon name="grid" size={16} /> Store List আনুন
        </button>
        <button type="button" onClick={() => void run("cities")} disabled={state === "loading"} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          <Icon name="map-pin" size={16} /> City List আনুন
        </button>
      </div>

      <p role="status" className={`mt-3 text-sm ${state === "error" ? "text-red-700" : state === "success" ? "text-green-700" : "text-gray-600"}`}>
        {message}
      </p>
      {environment && <p className="mt-1 text-xs text-gray-500">Environment: {environment}</p>}
      {stores !== null && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Pathao Store response দেখুন</summary><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(stores, null, 2)}</pre></details>}
      {cities !== null && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Pathao City response দেখুন</summary><pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(cities, null, 2)}</pre></details>}
    </section>
  );
}
