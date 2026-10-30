"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  export: "তথ্যের কপি",
  correction: "তথ্য সংশোধন",
  delete: "অ্যাকাউন্ট মুছে ফেলার অনুরোধ",
};
const statusNames: Record<DataRequest["status"], string> = {
  pending: "অপেক্ষমাণ",
  processing: "প্রক্রিয়াধীন",
  completed: "সম্পন্ন",
  rejected: "গ্রহণ করা হয়নি",
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
      if (!response.ok) throw new Error(result.error || "অনুরোধ লোড করা যায়নি।");
      setRequests(Array.isArray(result.requests) ? result.requests : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "অনুরোধ লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  async function submitRequest(requestType: "correction" | "delete") {
    if (requestType === "delete") {
      const confirmed = window.confirm(
        "আপনি কি অ্যাকাউন্ট মুছে ফেলার অনুরোধ জমা দিতে চান? এটি সঙ্গে সঙ্গে অ্যাকাউন্ট মুছবে না। পরিচয় যাচাই ও আইনগত/হিসাব সংক্রান্ত রেকর্ড পর্যালোচনার পর NEWEIX টিম অনুরোধটি প্রক্রিয়া করবে।"
      );
      if (!confirmed) return;
    }
    const customerMessage = requestType === "correction"
      ? window.prompt("কোন তথ্য সংশোধন করতে চান? (ঐচ্ছিক)", "") ?? ""
      : window.prompt("অ্যাকাউন্ট মুছে ফেলার কারণ (ঐচ্ছিক)", "") ?? "";
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_type: requestType, customer_message: customerMessage }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "অনুরোধ জমা দেওয়া যায়নি।");
      setMessage("আপনার অনুরোধ জমা হয়েছে। অ্যাকাউন্টে এর অগ্রগতি দেখতে পারবেন।");
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "অনুরোধ জমা দেওয়া যায়নি।");
    } finally { setBusy(false); }
  }

  return (
    <main className="page">
      <header className="header">
        <Link href="/" className="brand">NEWEIX</Link>
        <Link href="/account" className="back">← অ্যাকাউন্টে ফিরুন</Link>
      </header>
      <section className="content">
        <p className="eyebrow">YOUR DATA & PRIVACY</p>
        <h1>আপনার তথ্য ও গোপনীয়তা</h1>
        <p className="intro">আপনার অ্যাকাউন্টের সঙ্গে যুক্ত তথ্যের কপি নিতে, তথ্য সংশোধন করতে অথবা অ্যাকাউন্ট মুছে ফেলার অনুরোধ জমা দিতে পারবেন।</p>

        <article className="card">
          <h2>নিজের তথ্যের কপি নিন</h2>
          <p>প্রোফাইল, সংরক্ষিত ঠিকানা, কেনাকাটার পছন্দ, সম্মতির ইতিহাস এবং আপনার অ্যাকাউন্টের সঙ্গে যুক্ত অর্ডারের তথ্য JSON ফাইলে পাবেন।</p>
          <a className="primary" href="/api/account/export">আমার তথ্য ডাউনলোড করুন</a>
        </article>

        <article className="card">
          <h2>তথ্য সংশোধনের অনুরোধ</h2>
          <p>প্রোফাইল বা অন্য কোনো ব্যক্তিগত তথ্য সংশোধনে সহায়তা চাইতে পারেন।</p>
          <button type="button" disabled={busy} onClick={() => void submitRequest("correction")}>সংশোধনের অনুরোধ</button>
        </article>

        <article className="card danger-card">
          <h2>অ্যাকাউন্ট মুছে ফেলার অনুরোধ</h2>
          <p>এটি তাৎক্ষণিক মুছে ফেলা নয়। পরিচয় যাচাই, অর্ডার/হিসাবের বাধ্যবাধকতা এবং প্রযোজ্য সংরক্ষণনীতি পর্যালোচনা করে অনুরোধ নিষ্পত্তি করা হবে।</p>
          <button className="danger" type="button" disabled={busy} onClick={() => void submitRequest("delete")}>অ্যাকাউন্ট মুছে ফেলার অনুরোধ</button>
        </article>

        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <section className="history">
          <h2>আমার অনুরোধের অবস্থা</h2>
          {loading ? <p role="status">লোড হচ্ছে…</p> : requests.length === 0 ? <p>এখনো কোনো অনুরোধ জমা দেননি।</p> : requests.map((item) => (
            <article className="request" key={item.id}>
              <div><strong>{requestNames[item.request_type]}</strong><span className={`status ${item.status}`}>{statusNames[item.status]}</span></div>
              <small>{new Date(item.created_at).toLocaleString("bn-BD")}</small>
              {item.customer_message && <p>{item.customer_message}</p>}
              {item.resolution_note && <p className="resolution">NEWEIX-এর উত্তর: {item.resolution_note}</p>}
            </article>
          ))}
        </section>
      </section>
      <style jsx>{`
        .page{min-height:100vh;padding:0 18px 56px;background:#f7f8fa;color:#172338}
        .header{max-width:900px;min-height:68px;margin:auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e6ed}
        .brand{font-weight:800;letter-spacing:2px;color:#10233f;text-decoration:none}
        .back{color:#526078;text-decoration:none;font-size:14px}
        .content{max-width:760px;margin:34px auto}
        .eyebrow{font-size:12px;letter-spacing:2px;font-weight:700;color:#9a7a42}
        h1{font-size:30px;margin:8px 0}
        .intro{color:#68758a;line-height:1.7}
        .card,.request{margin-top:14px;padding:20px;border:1px solid #e5e8ef;border-radius:14px;background:white}
        h2{font-size:19px;margin:0 0 8px}
        .card p,.history>p{color:#68758a;line-height:1.7}
        button,.primary{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:8px;padding:10px 16px;border:0;border-radius:9px;background:#10233f;color:white;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
        button:disabled{opacity:.6;cursor:wait}
        .danger-card{border-color:#f0d5d2}
        .danger{background:#9f2828}
        .history{margin-top:30px}
        .request>div{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .status{font-size:12px;padding:4px 9px;border-radius:20px;background:#edf0f5}
        .status.completed{background:#e8f5ec;color:#17643a}
        .status.rejected{background:#fcebea;color:#a12d2d}
        .status.processing{background:#fff4dc;color:#845d14}
        .request small{display:block;margin-top:8px;color:#778195}
        .request p{color:#566276;line-height:1.6;overflow-wrap:anywhere}
        .resolution{padding:10px;background:#f7f8fa;border-radius:8px}
        .success{color:#167345}.error{color:#b42318}
        @media(max-width:520px){.content{margin-top:22px}.card,.request{padding:16px}}
      `}</style>
    </main>
  );
}
