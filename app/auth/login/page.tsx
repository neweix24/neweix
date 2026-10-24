"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setMessage("ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("role, is_active")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (
        profileError ||
        !profile ||
        profile.is_active !== true ||
        !["supreme", "admin", "staff"].includes(profile.role)
      ) {
        await supabase.auth.signOut();
        setMessage("এই অ্যাকাউন্টের স্টাফ প্যানেলে প্রবেশের অনুমতি নেই।");
        return;
      }

      const next = searchParams.get("next");

      if (next?.startsWith("/") && !next.startsWith("//")) {
        router.replace(next);
      } else if (profile.role === "supreme") {
        router.replace("/supreme");
      } else {
        router.replace("/admin");
      }

      router.refresh();
    } catch {
      setMessage("লগইন করা যায়নি। পরিবেশ ভেরিয়েবল পরীক্ষা করুন।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · STAFF ACCESS</p>
      <h1>নিরাপদ লগইন</h1>

      <p className="hero-copy">
        শুধু সক্রিয় ও অনুমোদিত স্টাফ অ্যাকাউন্ট প্রবেশ করতে পারবে।
      </p>

      <form className="track-form" onSubmit={handleSubmit}>
        <label htmlFor="email">ইমেইল</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">পাসওয়ার্ড</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {message && <p role="alert" className="hero-copy">{message}</p>}

        <button
          className="primary-button"
          type="submit"
          disabled={busy}
        >
          {busy ? "লগইন হচ্ছে…" : "লগইন করুন"}
        </button>
      </form>

      <p className="hero-copy">
        <a href="/">← হোম পেজে ফিরুন</a>
      </p>
    </main>
  );
}