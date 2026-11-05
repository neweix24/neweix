"use client";

import { useCallback, useEffect, useState } from "react";

type Nomination = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  created_at: string;
  review_note: string | null;
};
type Result = { nominations?: Nomination[]; error?: string; success?: boolean; nomination?: Nomination };

export default function SupremeManagerNominations() {
  const [items, setItems] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/supreme/manager-nominations", { cache: "no-store" });
      const result = (await response.json()) as Result;
      if (!response.ok) throw new Error(result.error || "Could not load nominations.");
      setItems(result.nominations ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch("/api/supreme/manager-nominations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, reviewNote: note }),
      });
      const result = (await response.json()) as Result;
      if (!response.ok) throw new Error(result.error || "Could not save decision.");
      setNote("");
      setMessage(status === "approved" ? "Nomination approved. Create the Manager account from Staff Management." : "Nomination rejected.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p>Loading nominations…</p>;

  return (
    <section className="space-y-5">
      <label htmlFor="nomination-review-note">Review note (optional)</label>
      <textarea id="nomination-review-note" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
      {message && <p role="status" aria-live="polite">{message}</p>}
      {items.length === 0 ? <p>No Manager nominations found.</p> : items.map((item) => (
        <article key={item.id} className="rounded-xl border p-4 space-y-2">
          <h2>{item.candidate_name}</h2>
          <p>{item.candidate_email}</p>
          <p>{item.reason}</p>
          <p>Status: {item.status}</p>
          <p>Submitted: {new Date(item.created_at).toLocaleString()}</p>
          {item.status === "pending" && (
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busyId !== null} onClick={() => void decide(item.id, "approved")}>
                {busyId === item.id ? "Saving…" : "Approve"}
              </button>
              <button type="button" disabled={busyId !== null} onClick={() => void decide(item.id, "rejected")}>
                {busyId === item.id ? "Saving…" : "Reject"}
              </button>
            </div>
          )}
          {item.review_note && <p>Review note: {item.review_note}</p>}
        </article>
      ))}
    </section>
  );
}
