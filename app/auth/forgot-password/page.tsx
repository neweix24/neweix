"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }
      );

      if (error) {
        setMessage(
          "রিকভারি ইমেইল পাঠানো যায়নি। ইমেইল ও Supabase সেটিংস যাচাই করুন।"
        );
        return;
      }

      setMessage(
        "রিকভারি ইমেইল পাঠানোর অনুরোধ করা হয়েছে। ইনবক্স ও Spam ফোল্ডার দেখুন।"
      );
    } catch {
      setMessage("সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · ACCOUNT RECOVERY</p>
      <h1>পাসওয়ার্ড রিসেট</h1>
      <p className="hero-copy">
        আপনার অ্যাকাউন্টের ইমেইল দিন। রিসেট লিংক পাঠানোর চেষ্টা করা হবে।
      </p>

      <form className="track-form" onSubmit={handleSubmit}>
        <label htmlFor="email">ইমেইল</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {message && <p role="status" className="hero-copy">{message}</p>}

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "পাঠানো হচ্ছে…" : "রিসেট লিংক পাঠান"}
        </button>
      </form>

      <p className="hero-copy">
        <Link href="/auth/login">লগইন পেজে ফিরে যান</Link>
      </p>
    </main>
  );
}