"use client";

import { useCallback, useEffect, useState } from "react";

type RequestItem = {
  id: string;
  user_id: string;
  request_type: "export" | "correction" | "delete";
  status: "pending" | "processing" | "completed" | "rejected";
  customer_message: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  customer: { full_name: string | null; display_name: string | null; phone: string | null } | null;
};

const labels: Record<RequestItem["request_type"], string> = {
  export: "তথ্যের কপি",
  correction: "তথ্য সংশোধন",
  delete: "অ্যাকাউন্ট মুছে ফেলা",
};
const statuses: Record<RequestItem["status"], string> = {
  pending: "অপেক্ষমাণ",
  processing: "প্রক্রিয়াধীন",
  completed: "সম্পন্ন",
  rejected: "গ্রহণ করা হয়নি",
};

export default function CustomerDataRequestsManager() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/customer-data-requests", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "অনুরোধ লোড করা যায়নি।");
      setRequests(Array.isArray(result.requests) ? result.requests : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "সার্ভারে সমস্যা হয়েছে।");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function update(item: RequestItem, status: "processing" | "completed" | "rejected") {
    if ((status === "completed" || status === "rejected") && !window.confirm("অনুরোধটির কাজ বাস্তবে যাচাই করে সম্পন্ন করেছেন?")) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/customer-data-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status, resolution_note: notes[item.id] ?? "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "অবস্থা আপডেট করা যায়নি।");
      setNotice("অনুরোধের অবস্থা আপডেট হয়েছে।");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "সার্ভারে সমস্যা হয়েছে।");
    } finally { setBusyId(""); }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>সর্বশেষ ২০০টি কাস্টমার অনুরোধ</p>
        <button type="button" onClick={() => void load()} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>রিফ্রেশ</button>
      </div>
      {notice && <p role="status" className="text-green-700">{notice}</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {loading && <p role="status">অনুরোধ লোড হচ্ছে…</p>}
      {!loading && requests.length === 0 && <p>কোনো অনুরোধ নেই।</p>}
      {requests.map((item) => (
        <article key={item.id} className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{labels[item.request_type]}</h2>
            <span className="rounded-full px-3 py-1 text-xs" style={{ background: "var(--bg)" }}>{statuses[item.status]}</span>
          </div>
          <p className="mt-2 text-sm">{item.customer?.full_name || item.customer?.display_name || "নাম পাওয়া যায়নি"} · {item.customer?.phone || "ফোন নেই"}</p>
          <p className="mt-1 break-all text-xs" style={{ color: "var(--muted)" }}>Customer ID: {item.user_id}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Request: {item.id} · {new Date(item.created_at).toLocaleString("bn-BD")}</p>
          {item.customer_message && <p className="mt-3 whitespace-pre-wrap">{item.customer_message}</p>}
          {item.resolution_note && <p className="mt-2 text-sm">সর্বশেষ নোট: {item.resolution_note}</p>}
          {item.status !== "completed" && item.status !== "rejected" && (
            <div className="mt-4 grid gap-2">
              <label className="text-sm font-medium" htmlFor={`note-${item.id}`}>প্রক্রিয়ার নোট (ঐচ্ছিক)</label>
              <textarea id={`note-${item.id}`} rows={2} maxLength={1000} value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} className="w-full rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--ink)" }} />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busyId === item.id} onClick={() => void update(item, "processing")} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>প্রক্রিয়াধীন করুন</button>
                <button type="button" disabled={busyId === item.id} onClick={() => void update(item, "completed")} className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "var(--primary)", color: "#10170d" }}>সম্পন্ন</button>
                <button type="button" disabled={busyId === item.id} onClick={() => void update(item, "rejected")} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#b42318", color: "#b42318" }}>প্রত্যাখ্যান</button>
              </div>
            </div>
          )}
          {item.request_type === "delete" && <p className="mt-3 text-xs text-amber-700">সতর্কতা: এখানে Status সম্পন্ন করা মানে অনুরোধের কাজ বাস্তবে সম্পন্ন হয়েছে। কেবল বাটন চাপলেই Auth অ্যাকাউন্ট বা অর্ডার মুছে যায় না।</p>}
        </article>
      ))}
    </section>
  );
}
