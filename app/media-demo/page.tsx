"use client";

import { useState } from "react";

type UploadResult = {
  ok?: boolean;
  error?: string;
  display_url?: string;
  file_id?: string;
  file_unique_id?: string;
  file_size?: number;
  mime_type?: string;
  message_id?: number;
};

export default function TelegramMediaDemoPage() {
  const [secret, setSecret] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload() {
    if (!file || !secret) {
      setError("ছবি এবং Upload Secret দুটিই দিতে হবে।");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const body = new FormData();
      body.set("image", file);
      body.set("caption", "Neweix Telegram Storage Demo");
      const response = await fetch("/api/media/telegram/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        body,
      });
      const data = (await response.json()) as UploadResult;
      if (!response.ok || !data.ok || !data.display_url) {
        throw new Error(data.error || `UPLOAD_FAILED_${response.status}`);
      }
      setResult(data);
      setSecret("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "UPLOAD_FAILED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 80px", color: "#eaf1ff" }}>
      <p style={{ color: "#75a8ff", letterSpacing: 2, fontSize: 12, fontWeight: 700 }}>NEWEIX / MEDIA LAB</p>
      <h1 style={{ fontSize: "clamp(30px, 6vw, 46px)", margin: "10px 0" }}>Telegram Image Storage Demo</h1>
      <p style={{ color: "#aab9d2", lineHeight: 1.7 }}>
        একটি ছবি Private Telegram Channel-এ পাঠিয়ে Neweix URL দিয়ে আবার দেখুন।
        এই পরীক্ষার জন্য Upload Secret শুধু অনুরোধে পাঠানো হয়, পেজে সংরক্ষণ করা হয় না।
      </p>

      <section style={{ marginTop: 28, padding: 22, border: "1px solid #263b60", borderRadius: 18, background: "#0b1b36" }}>
        <label style={{ display: "block", fontWeight: 650, marginBottom: 9 }}>ছবি নির্বাচন করুন (JPEG / PNG / WebP, সর্বোচ্চ ১০ MiB)</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          style={{ display: "block", width: "100%", marginBottom: 18 }}
        />
        {file && <p style={{ color: "#aab9d2", fontSize: 13 }}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MiB</p>}

        <label htmlFor="upload-secret" style={{ display: "block", fontWeight: 650, margin: "18px 0 8px" }}>Upload Secret</label>
        <input
          id="upload-secret"
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="আপনার Cloudflare secret এখানে লিখুন"
          style={{ boxSizing: "border-box", width: "100%", padding: 13, borderRadius: 10, border: "1px solid #36517c", background: "#07152f", color: "#fff" }}
        />
        <button
          type="button"
          disabled={busy || !file || !secret}
          onClick={upload}
          style={{ marginTop: 18, padding: "13px 20px", borderRadius: 10, border: 0, background: busy ? "#42516b" : "#2878ff", color: "white", fontWeight: 700, opacity: busy || !file || !secret ? 0.65 : 1 }}
        >
          {busy ? "আপলোড হচ্ছে…" : "Telegram-এ ছবি আপলোড করুন"}
        </button>
        {error && <p role="alert" style={{ color: "#ff9c9c", marginTop: 16 }}>{error}</p>}
      </section>

      {result?.display_url && (
        <section style={{ marginTop: 24, padding: 22, border: "1px solid #285b49", borderRadius: 18, background: "#0b1f2c" }}>
          <h2 style={{ fontSize: 22, marginTop: 0 }}>আপলোড সফল</h2>
          <img src={result.display_url} alt="Telegram থেকে Neweix-এ পরিবেশিত আপলোড করা ছবি" style={{ display: "block", width: "100%", maxHeight: 480, objectFit: "contain", borderRadius: 12, background: "#07152f" }} />
          <p style={{ overflowWrap: "anywhere", color: "#aab9d2", fontSize: 13 }}>Neweix URL: {result.display_url}</p>
          <p style={{ color: "#aab9d2", fontSize: 13 }}>Telegram message: {result.message_id} · {(Number(result.file_size ?? 0) / 1024).toFixed(1)} KiB · {result.mime_type}</p>
          <button type="button" onClick={() => { const image = document.querySelector<HTMLImageElement>("img[alt='Telegram থেকে Neweix-এ পরিবেশিত আপলোড করা ছবি']"); if (image) image.src = result.display_url + "?refresh=" + Date.now(); }} style={{ padding: "10px 14px", borderRadius: 9, border: "1px solid #52749e", background: "transparent", color: "#fff" }}>
            আবার লোড করুন
          </button>
        </section>
      )}

      <p style={{ color: "#7f91ad", fontSize: 12, marginTop: 28, lineHeight: 1.6 }}>
        Demo page-এ Secret browser storage-এ রাখা হয় না। Upload endpoint-এ Secret পাঠানো হয়। এটি অস্থায়ী পরীক্ষার ইন্টারফেস; production Admin authorization-এর বিকল্প নয়।
      </p>
    </main>
  );
}
