"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useRouter } from "next/navigation";

type DataRequest = {
  id: string;
  request_type: "export" | "correction" | "delete";
  status: "pending" | "processing" | "completed" | "rejected";
  customer_message: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

const requestNames: Record<DataRequest["request_type"], string> = {
  export: "Data export",
  correction: "Data correction",
  delete: "Account deletion request",
};
const statusNames: Record<DataRequest["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  rejected: "Rejected",
};

export default function CustomerDataRequests() {
  const router = useRouter();
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      const response = await fetch("/api/account/data-requests", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/auth/customer-login?next=/account/data-requests");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Could not load requests.");
      setRequests(Array.isArray(result.requests) ? result.requests : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  async function submitRequest(requestType: "correction" | "delete") {
    if (requestType === "delete") {
      const confirmed = window.confirm(
        "Do you want to submit an account deletion request? This will not delete your account immediately. The NEWEIX team will review your identity and any legal or accounting record-retention requirements before processing the request."
      );
      if (!confirmed) return;
    }
    const customerMessage = requestType === "correction"
      ? window.prompt("Which information would you like to correct? (Optional)", "") ?? ""
      : window.prompt("Reason for requesting account deletion (optional)", "") ?? "";
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_type: requestType, customer_message: customerMessage }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit the request.");
      setMessage("Your request has been submitted. You can track its progress in your account.");
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the request.");
    } finally { setBusy(false); }
  }

  return (
    <main className="page">
      <header className="header">
        <Link href="/" className="brand">NEWEIX</Link>
        <Link href="/account" className="back">← Back to account</Link>
      </header>
      <section className="content">
        <p className="eyebrow">YOUR DATA & PRIVACY</p>
        <h1>Your data and privacy</h1>
        <p className="intro">You can request a copy of information linked to your account, request corrections, or submit an account deletion request.</p>

        <article className="card">
          <h2>Download a copy of your data</h2>
          <p>Receive a JSON file containing your profile, saved addresses, shopping preferences, consent history, and orders linked to your account.</p>
          <a className="primary" href="/api/account/export">Download my data</a>
        </article>

        <article className="card">
          <h2>Request a data correction</h2>
          <p>You can request help correcting your profile or other personal information.</p>
          <button type="button" disabled={busy} onClick={() => void submitRequest("correction")}><Icon name="settings" size={16} /> Request correction</button>
        </article>

        <article className="card danger-card">
          <h2>Account deletion request</h2>
          <p>This does not delete your account immediately. The request will be reviewed against identity verification, order and accounting obligations, and applicable retention policies.</p>
          <button className="danger" type="button" disabled={busy} onClick={() => void submitRequest("delete")}><Icon name="trash" size={16} /> Account deletion request</button>
        </article>

        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <section className="history">
          <h2>My request status</h2>
          {loading ? <p role="status">Loading…</p> : requests.length === 0 ? <p>You have not submitted any requests yet.</p> : requests.map((item) => (
            <article className="request" key={item.id}>
              <div><strong>{requestNames[item.request_type]}</strong><span className={`status ${item.status}`}>{statusNames[item.status]}</span></div>
              <small>{new Date(item.created_at).toLocaleString("bn-BD")}</small>
              {item.customer_message && <p>{item.customer_message}</p>}
              {item.resolution_note && <p className="resolution">NEWEIX response: {item.resolution_note}</p>}
            </article>
          ))}
        </section>
      </section>
      <style jsx>{`
        .page{min-height:100vh;padding:0 18px 56px;background:var(--bg);color:var(--ink)}
        .header{max-width:900px;min-height:68px;margin:auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}
        .brand{font-weight:800;letter-spacing:2px;color:var(--primary);text-decoration:none}
        .back{color:var(--muted);text-decoration:none;font-size:14px}
        .content{max-width:760px;margin:34px auto}
        .eyebrow{font-size:12px;letter-spacing:2px;font-weight:700;color:var(--primary)}
        h1{font-size:30px;margin:8px 0}
        .intro{color:var(--muted);line-height:1.7}
        .card,.request{margin-top:14px;padding:20px;border:1px solid var(--border);border-radius:14px;background:white}
        h2{font-size:19px;margin:0 0 8px}
        .card p,.history>p{color:var(--muted);line-height:1.7}
        button,.primary{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:8px;padding:10px 16px;border:0;border-radius:9px;background:var(--primary);color:white;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
        button:disabled{opacity:.6;cursor:wait}
        .danger-card{border-color:var(--surface-raised)}
        .danger{background:var(--danger)}
        .history{margin-top:30px}
        .request>div{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .status{font-size:12px;padding:4px 9px;border-radius:20px;background:var(--surface-raised)}
        .status.completed{background:var(--brand-lime-soft);color:var(--success)}
        .status.rejected{background:var(--surface-raised);color:var(--danger)}
        .status.processing{background:var(--brand-lime-soft);color:var(--primary)}
        .request small{display:block;margin-top:8px;color:var(--muted)}
        .request p{color:var(--muted);line-height:1.6;overflow-wrap:anywhere}
        .resolution{padding:10px;background:var(--bg);border-radius:8px}
        .success{color:var(--success)}.error{color:var(--danger)}
        @media(max-width:520px){.content{margin-top:22px}.card,.request{padding:16px}}
      `}</style>
    </main>
  );
}
