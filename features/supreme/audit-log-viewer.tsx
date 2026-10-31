"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/ui/icon";

type AuditEntry = {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
};

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(async (next?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (action.trim()) params.set("action", action.trim());
      if (actorId.trim()) params.set("actor_id", actorId.trim());
      if (next) params.set("cursor", next);
      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "অডিট লগ লোড করা যায়নি।");
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setCursor(next ?? null);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "অডিট লগ লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, [action, actorId]);

  useEffect(() => { void load(null); }, [load]);

  return (
    <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid flex-1 gap-1 text-sm">Action filter
          <input value={action} onChange={(event) => setAction(event.target.value)} maxLength={100} className="rounded-lg border bg-transparent px-3 py-2" style={{ borderColor: "var(--border)" }} placeholder="যেমন order.status.updated" />
        </label>
        <label className="grid flex-1 gap-1 text-sm">Actor UUID
          <input value={actorId} onChange={(event) => setActorId(event.target.value)} maxLength={36} className="rounded-lg border bg-transparent px-3 py-2" style={{ borderColor: "var(--border)" }} placeholder="Supreme/Admin user ID" />
        </label>
        <button type="button" onClick={() => void load(null)} disabled={loading} className="rounded-lg border px-4 py-2" style={{ borderColor: "var(--border)" }}><Icon name="filter" size={16} /> ফিল্টার প্রয়োগ</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 p-4 text-sm">{error}</p>}
      {loading ? <p className="py-8 text-sm" style={{ color: "var(--muted)" }}>অডিট লগ লোড হচ্ছে…</p> : !error && logs.length === 0 ? <p className="py-8 text-sm" style={{ color: "var(--muted)" }}>কোনো অডিট লগ পাওয়া যায়নি।</p> : !error && (
        <div className="mt-5 space-y-3">
          {logs.map((entry) => (
            <article key={entry.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{entry.action}</strong>
                <time className="text-xs" style={{ color: "var(--muted)" }}>{new Date(entry.created_at).toLocaleString("bn-BD")}</time>
              </div>
              <p className="mt-1 break-all text-sm" style={{ color: "var(--muted)" }}>
                {entry.target_type || "Target"} · {entry.target_id || "ID নেই"} · Actor: {entry.actor_id || "System"}
              </p>
            </article>
          ))}
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" disabled={loading || !cursor} onClick={() => void load(null)} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}><Icon name="refresh" size={15} /> প্রথম পৃষ্ঠা</button>
        <button type="button" disabled={loading || !nextCursor} onClick={() => void load(nextCursor)} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>পরের পৃষ্ঠা <Icon name="chevron-right" size={15} /></button>
      </div>
    </section>
  );
}
