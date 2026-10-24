"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

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

      if (profile.role === "supreme") {
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();

        if (factorsError) {
          setMessage("MFA তথ্য যাচাই করা যায়নি। আবার চেষ্টা করুন।");
          return;
        }

        const verifiedFactor = factors.totp.find(
          (factor) => factor.status === "verified"
        );

        if (!verifiedFactor) {
          router.replace("/auth/mfa/setup");
        } else {
          const { data: assurance, error: assuranceError } =
            await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

          if (assuranceError) {
            setMessage("নিরাপত্তা যাচাই করা যায়নি। আবার চেষ্টা করুন।");
            return;
          }

          if (assurance.currentLevel !== "aal2") {
            router.replace("/auth/mfa");
          } else {
            router.replace("/supreme");
          }
        }
      } else {
        const next = new URLSearchParams(window.location.search).get("next");

        if (next?.startsWith("/") && !next.startsWith("//")) {
          router.replace(next);
        } else {
          router.replace("/admin");
        }
      }

      router.refresh();
    } catch {
      setMessage("লগইন করা যায়নি। Supabase পরিবেশ ভেরিয়েবল পরীক্ষা করুন।");
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

        <p>
          <Link href="/auth/forgot-password">
            পাসওয়ার্ড ভুলে গেছ?
          </Link>
        </p>

        {message && <p role="alert">{message}</p>}

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "লগইন হচ্ছে…" : "লগইন করুন"}
        </button>
      </form>

      <p className="hero-copy">
        <a href="/">← হোম পেজে ফিরুন</a>
      </p>
    </main>
  );
}