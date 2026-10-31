"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function navigateAfterAuth(path: string) {
    // A full document navigation makes the newly written Supabase auth cookies
    // available to Cloudflare middleware before the protected route is loaded.
    window.location.replace(path);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

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

      // Confirm that the browser client has persisted a usable session before
      // navigating to a route whose access is validated by middleware.
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        setMessage("লগইন হয়েছে, কিন্তু নিরাপদ সেশন সংরক্ষণ হয়নি। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("role, is_active")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileError) {
        setMessage("স্টাফ অ্যাকাউন্ট যাচাই করা যায়নি। ডেটাবেস অনুমতি ও সংযোগ পরীক্ষা করুন।");
        return;
      }

      if (
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
          navigateAfterAuth("/auth/mfa/setup");
          return;
        }

        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

        if (assuranceError) {
          setMessage("নিরাপত্তা যাচাই করা যায়নি। আবার চেষ্টা করুন।");
          return;
        }

        if (assurance.currentLevel !== "aal2") {
          navigateAfterAuth("/auth/mfa");
          return;
        }

        navigateAfterAuth("/supreme");
        return;
      }

      navigateAfterAuth("/admin");
    } catch {
      setMessage("লগইন করা যায়নি। Supabase পরিবেশ ভেরিয়েবল ও নেটওয়ার্ক সংযোগ পরীক্ষা করুন।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero auth-page">
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
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">পাসওয়ার্ড</label>
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          type="button"
          className="password-visibility-button"
          aria-label={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান"}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((visible) => !visible)}
        >
          <Icon name="eye" size={17} />
        </button>

        <p>
          <Link href="/auth/forgot-password">
            পাসওয়ার্ড ভুলে গেছেন?
          </Link>
        </p>

        {message && <p role="alert">{message}</p>}

        <button className="primary-button" type="submit" disabled={busy}>
          <><Icon name={busy ? "refresh" : "user"} size={17} /> {busy ? "লগইন হচ্ছে…" : "লগইন করুন"}</>
        </button>
      </form>

      <p className="hero-copy">
        <Link href="/">← হোম পেজে ফিরুন</Link>
      </p>
    </main>
  );
}
