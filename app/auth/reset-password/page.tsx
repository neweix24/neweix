"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("দুটি পাসওয়ার্ড মিলছে না।");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setMessage(
          "রিসেট লিংকটি অবৈধ বা মেয়াদ শেষ হয়েছে। নতুন রিসেট লিংক নাও।"
        );
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("পাসওয়ার্ড পরিবর্তন হয়েছে। এখন লগইন করো।");

      setTimeout(() => {
        router.replace("/auth/login");
      }, 1500);
    } catch {
      setMessage("সমস্যা হয়েছে। আবার চেষ্টা করো।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-container">
      <section className="auth-card">
        <h1>নতুন পাসওয়ার্ড সেট করো</h1>
        <p>নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="password">নতুন পাসওয়ার্ড</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />

          <label htmlFor="confirmPassword">পাসওয়ার্ড আবার লেখো</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />

          {message && <p role="status">{message}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "অপেক্ষা করো..." : "পাসওয়ার্ড পরিবর্তন করো"}
          </button>
        </form>
      </section>
    </main>
  );
}