"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
        }),
      });

      const data: { message?: string; error?: string } =
        await response.json();

      if (!response.ok) {
        setMessage(
          data.error ?? "সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।"
        );
        return;
      }

      setMessage(
        data.message ??
          "যদি এই ইমেইলে পাসওয়ার্ড লগইন চালু থাকে, তাহলে রিসেটের নির্দেশনা পাঠানো হবে।"
      );
    } catch {
      setMessage("সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · ACCOUNT RECOVERY</p>
      <h1>পাসওয়ার্ড রিসেট</h1>
      <p className="hero-copy">
        আপনার অ্যাকাউন্টের ইমেইল দিন। পাসওয়ার্ড রিসেটের নির্দেশনা
        পাঠানোর অনুরোধ করা হবে।
      </p>

      <form className="track-form" onSubmit={handleSubmit}>
        <label htmlFor="email">ইমেইল</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {message && (
          <p role="status" aria-live="polite" className="hero-copy">
            {message}
          </p>
        )}

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "যাচাই করা হচ্ছে…" : "রিসেট লিংক পাঠান"}
        </button>
      </form>

      <p className="hero-copy">
        <Link href="/auth/login">লগইন পেজে ফিরে যান</Link>
      </p>
    </main>
  );
}