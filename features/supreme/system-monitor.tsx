"use client";
import { useCallback, useEffect, useState } from "react";

type Check = {
  label: string;
  ok: boolean;
  detail: string;
  ms: number;
};

export default function SystemMonitor() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");

  const runChecks = useCallback(async () => {
    setBusy(true);
    const targets = [
      { label: "Admin Product API", url: "/api/admin/products" },
      { label: "Admin Orders API", url: "/api/admin/orders" },
    ];

    const results = await Promise.all(
      targets.map(async (target): Promise<Check> => {
        const started = Date.now();
        try {
          const response = await fetch(target.url, { cache: "no-store" });
          const data: unknown = await response.json().catch(() => null);
          const message =
            data && typeof data === "object" && "error" in data
              ? String(data.error)
              : response.ok
                ? "API response পাওয়া গেছে"
                : `HTTP ${response.status}`;
          return {
            label: target.label,
            ok: response.ok,
            detail: message,
            ms: Date.now() - started,
          };
        } catch (error) {
          return {
            label: target.label,
            ok: false,
            detail: error instanceof Error ? error.message : "Network error",
            ms: Date.now() - started,
          };
        }
      })
    );

    setChecks(results);
    setCheckedAt(new Date().toLocaleString("bn-BD"));
    setBusy(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  return (
    <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">API সংযোগ পরীক্ষা</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            এটি browser-level API check; Cloudflare, database uptime বা infrastructure metrics নয়।
          </p>
        </div>
        <button type="button" onClick={() => void runChecks()} disabled={busy} className="rounded-xl border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          {busy ? "পরীক্ষা চলছে…" : "আবার পরীক্ষা করুন"}
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {checks.map((check) => (
          <article key={check.label} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
            <div>
              <h3 className="font-semibold">{check.label}</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{check.detail}</p>
            </div>
            <div className="text-right">
              <p className={check.ok ? "font-semibold text-emerald-500" : "font-semibold text-red-400"}>
                {check.ok ? "সাড়া দিয়েছে" : "ব্যর্থ"}
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>{check.ms} ms</p>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
        সর্বশেষ পরীক্ষা: {checkedAt || "—"}
      </p>
    </section>
  );
}