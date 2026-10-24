"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    if (password.length < 8) {
      setMessage("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("দুটি পাসওয়ার্ড মিলছে না।");
      return;
    }

    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();

      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session) {
        setMessage(
          "রিসেট লিংকটি মেয়াদোত্তীর্ণ বা অবৈধ। নতুন রিসেট লিংক নাও।"
        );
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage(
          "পাসওয়ার্ড পরিবর্তন হয়নি। রিসেট লিংকটি আবার যাচাই করো।"
        );
        return;
      }

      setSuccess(true);
      setMessage("পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে। এখন লগইন করো।");
    } catch {
      setMessage("সমস্যা হয়েছে। নতুন রিসেট লিংক নিয়ে আবার চেষ্টা করো।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · ACCOUNT RECOVERY</p>
      <h1>নতুন পাসওয়ার্ড সেট করো</h1>
      <p className="hero-copy">
        নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।
      </p>

      <form className="track-form" onSubmit={handleSubmit}>
        <label htmlFor="password">নতুন পাসওয়ার্ড</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <label htmlFor="confirmPassword">আবার পাসওয়ার্ড লেখো</label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {message && (
          <p role={success ? "status" : "alert"}>{message}</p>
        )}

        {success ? (
          <Link className="primary-button" href="/auth/login">
            লগইন পেজে যাও
          </Link>
        ) : (
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "পরিবর্তন হচ্ছে..." : "পাসওয়ার্ড পরিবর্তন করো"}
          </button>
        )}
      </form>

      <p className="hero-copy">
        <Link href="/auth/login">লগইন পেজে ফিরে যাও</Link>
      </p>
    </main>
  );
}