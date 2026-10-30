"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function CustomerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function getSafeNextPath() {
    const next = searchParams.get("next");

    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return next;
    }

    return "/account";
  }

  async function signInWithProvider(provider: "google" | "facebook") {
    setMessage("");
    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const next = getSafeNextPath();
      const callbackUrl = new URL("/auth/callback", window.location.origin);

      callbackUrl.searchParams.set("next", next);

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams:
            provider === "google"
              ? { prompt: "select_account" }
              : undefined,
        },
      });

      if (error) {
        setMessage(
          provider === "google"
            ? "Google লগইন শুরু করা যায়নি। OAuth সেটিংস পরীক্ষা করুন।"
            : "Facebook লগইন শুরু করা যায়নি। OAuth সেটিংস পরীক্ষা করুন।"
        );
        setBusy(false);
      }
    } catch {
      setMessage("লগইন পরিষেবা পাওয়া যাচ্ছে না। Supabase সেটিংস পরীক্ষা করুন।");
      setBusy(false);
    }
  }

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
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
        setMessage("ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।");
        return;
      }

      router.replace(getSafeNextPath());
      router.refresh();
    } catch {
      setMessage("লগইন করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="customer-auth">
      <section className="auth-brand-panel">
        <Link href="/" className="auth-brand">
          neweix<span>.</span>
        </Link>

        <div className="auth-brand-copy">
          <p className="auth-eyebrow">SMART SHOPPING, MADE SIMPLE</p>
          <h1>আপনার পছন্দের কেনাকাটা, এক জায়গায়।</h1>
          <p>
            অ্যাকাউন্টে প্রবেশ করে অর্ডার, ডেলিভারি, ঠিকানা ও পছন্দগুলো
            সহজে পরিচালনা করুন।
          </p>
        </div>

        <p className="auth-brand-footer">Neweix · আপনার বিশ্বস্ত অনলাইন শপ</p>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <Link href="/" className="auth-mobile-brand">
            neweix<span>.</span>
          </Link>

          <p className="auth-eyebrow">WELCOME TO NEWEIX</p>
          <h2>আপনার অ্যাকাউন্টে প্রবেশ করুন</h2>
          <p className="auth-subtitle">
            Google, Facebook অথবা ইমেইল দিয়ে চালিয়ে যান।
          </p>

          <button
            className="auth-social-button"
            type="button"
            disabled={busy}
            onClick={() => void signInWithProvider("google")}
          >
            <span className="auth-google-mark" aria-hidden="true">G</span>
            Google দিয়ে চালিয়ে যান
          </button>

          <button
            className="auth-social-button"
            type="button"
            disabled={busy}
            onClick={() => void signInWithProvider("facebook")}
          >
            <span className="auth-facebook-mark" aria-hidden="true">f</span>
            Facebook দিয়ে চালিয়ে যান
          </button>

          <div className="auth-divider">
            <span>অথবা ইমেইল ব্যবহার করুন</span>
          </div>

          <form className="auth-email-form" onSubmit={signInWithEmail}>
            <label htmlFor="customer-email">ইমেইল ঠিকানা</label>
            <input
              id="customer-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <div className="auth-password-label">
              <label htmlFor="customer-password">পাসওয়ার্ড</label>
              <Link href="/auth/forgot-password">পাসওয়ার্ড ভুলে গেছেন?</Link>
            </div>

            <input
              id="customer-password"
              type="password"
              autoComplete="current-password"
              placeholder="আপনার পাসওয়ার্ড"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {message && (
              <p className="auth-message" role="alert">
                {message}
              </p>
            )}

            <button
              className="auth-submit-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "অপেক্ষা করুন..." : "লগইন করুন"}
            </button>
          </form>

          {!message && (
            <p className="auth-privacy-note">
              আপনার তথ্য নিরাপদ রাখতে আমরা সুরক্ষিত লগইন ব্যবহার করি।
            </p>
          )}

          <p className="auth-guest-note">
            অর্ডার করতে অ্যাকাউন্টে লগইন করে ফোন নম্বর OTP দিয়ে যাচাই করুন।
          </p>

          <p className="auth-staff-note">
            স্টাফ বা অ্যাডমিন? <Link href="/auth/login">স্টাফ লগইন</Link>
          </p>
        </div>
      </section>

      <style jsx>{`
        .customer-auth {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          background: #fff;
          color: #172338;
        }

        .auth-brand-panel {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: clamp(28px, 5vw, 72px);
          color: white;
          background:
            radial-gradient(ellipse at 10% 90%, #314d70 0, transparent 45%),
            linear-gradient(145deg, #10233f, #172f50);
        }

        .auth-brand,
        .auth-mobile-brand {
          width: fit-content;
          font-size: 32px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: -1.8px;
          color: inherit;
          text-decoration: none;
        }

        .auth-brand span,
        .auth-mobile-brand span {
          color: #d9b778;
        }

        .auth-brand-copy {
          max-width: 490px;
          padding: 54px 0;
        }

        .auth-eyebrow {
          color: #a98750;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.8px;
        }

        .auth-brand-copy h1 {
          margin: 20px 0;
          font-size: clamp(34px, 4vw, 56px);
          line-height: 1.2;
          letter-spacing: -1.5px;
        }

        .auth-brand-copy > p:last-child {
          max-width: 410px;
          color: #d1dbea;
          line-height: 1.9;
        }

        .auth-brand-footer {
          color: #c3cfdf;
          font-size: 12px;
        }

        .auth-form-panel {
          display: grid;
          place-items: center;
          padding: 44px 24px;
        }

        .auth-form-wrap {
          width: 100%;
          max-width: 410px;
        }

        .auth-mobile-brand {
          display: none;
          color: #10233f;
          margin-bottom: 40px;
        }

        .auth-form-wrap h2 {
          margin: 12px 0;
          color: #10233f;
          font-size: clamp(25px, 3vw, 34px);
          line-height: 1.35;
        }

        .auth-subtitle {
          margin: 0 0 28px;
          color: #778195;
          font-size: 14px;
          line-height: 1.8;
        }

        .auth-social-button {
          width: 100%;
          min-height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 10px 0;
          padding: 12px;
          border: 1px solid #dce2ea;
          border-radius: 10px;
          background: white;
          color: #243248;
          font: inherit;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
          transition: background 150ms, border-color 150ms;
        }

        .auth-social-button:hover:not(:disabled) {
          background: #f7f9fc;
          border-color: #aebbd0;
        }

        .auth-social-button:disabled,
        .auth-submit-button:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .auth-google-mark,
        .auth-facebook-mark {
          font-size: 20px;
          font-weight: 850;
        }

        .auth-google-mark {
          color: #4285f4;
        }

        .auth-facebook-mark {
          color: #1877f2;
        }

        .auth-divider {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 24px 0;
          color: #8993a4;
          font-size: 12px;
        }

        .auth-divider::before,
        .auth-divider::after {
          content: "";
          height: 1px;
          flex: 1;
          background: #e8ecf2;
        }

        .auth-email-form {
          display: grid;
          gap: 10px;
        }

        .auth-email-form label {
          color: #344258;
          font-size: 13px;
          font-weight: 700;
        }

        .auth-email-form input {
          width: 100%;
          min-height: 48px;
          padding: 12px 14px;
          border: 1px solid #dce2ea;
          border-radius: 9px;
          outline: none;
          background: white;
          color: #172338;
          font: inherit;
          font-size: 14px;
        }

        .auth-email-form input:focus {
          border-color: #10233f;
          box-shadow: 0 0 0 3px #10233f12;
        }

        .auth-password-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
        }

        .auth-password-label a,
        .auth-guest-note a,
        .auth-staff-note a {
          color: #8b6c39;
          font-weight: 700;
          text-decoration: none;
        }

        .auth-password-label a {
          font-size: 12px;
        }

        .auth-submit-button {
          min-height: 50px;
          margin-top: 12px;
          border: 0;
          border-radius: 9px;
          background: #10233f;
          color: white;
          font: inherit;
          font-weight: 750;
          cursor: pointer;
        }

        .auth-submit-button:hover:not(:disabled) {
          background: #1c385e;
        }

        .auth-message {
          margin: 8px 0 0;
          color: #b42318;
          font-size: 13px;
          line-height: 1.7;
        }

        .auth-privacy-note,
        .auth-guest-note,
        .auth-staff-note {
          color: #778195;
          font-size: 12px;
          line-height: 1.8;
          text-align: center;
        }

        .auth-privacy-note {
          margin-top: 20px;
        }

        .auth-guest-note {
          margin-top: 26px;
        }

        .auth-staff-note {
          margin-top: 18px;
        }

        @media (max-width: 760px) {
          .customer-auth {
            grid-template-columns: 1fr;
          }

          .auth-brand-panel {
            display: none;
          }

          .auth-form-panel {
            min-height: 100vh;
            padding: 34px 22px;
          }

          .auth-mobile-brand {
            display: block;
          }
        }
      `}</style>
    </main>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
          লগইন পেজ লোড হচ্ছে...
        </main>
      }
    >
      <CustomerLoginForm />
    </Suspense>
  );
}