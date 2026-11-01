"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = "0x4AAAAAAFtxqj-OF3yfnL11";

function CustomerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(searchParams.get("mode") === "signup");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const captchaWidgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileReady || !captchaContainerRef.current || !window.turnstile || captchaWidgetIdRef.current) return;
    captchaWidgetIdRef.current = window.turnstile.render(captchaContainerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "auto",
      callback: (token) => { setCaptchaToken(token); setMessage(""); },
      "expired-callback": () => setCaptchaToken(""),
      "error-callback": () => {
        setCaptchaToken("");
        setMessage("Security verification was not completed. Please try again.");
      },
    });
    return () => {
      if (captchaWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(captchaWidgetIdRef.current);
        captchaWidgetIdRef.current = null;
      }
    };
  }, [turnstileReady]);

  function resetCaptcha() {
    setCaptchaToken("");
    if (captchaWidgetIdRef.current && window.turnstile) {
      window.turnstile.reset(captchaWidgetIdRef.current);
    }
  }

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
            ? "Could not start Google sign-in. Check the OAuth settings."
            : "Could not start Facebook sign-in. Check the OAuth settings."
        );
        setBusy(false);
      }
    } catch {
      setMessage("The sign-in service is unavailable. Check the Supabase settings.");
      setBusy(false);
    }
  }

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!captchaToken) {
      setMessage("Complete the account security verification.");
      return;
    }
    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();

      if (isSignUp) {
        if (fullName.trim().length < 2 || fullName.trim().length > 100) {
          setMessage("Enter a name between 2 and 100 characters.");
          return;
        }

        const callbackUrl = new URL("/auth/callback", window.location.origin);
        callbackUrl.searchParams.set("next", "/account");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: callbackUrl.toString(),
            data: { full_name: fullName.trim() },
            captchaToken,
          },
        });

        resetCaptcha();
        if (error) {
          setMessage("Could not create the account. Check whether this email address is already in use.");
          return;
        }

        if (data.session) {
          await fetch("/api/account/security/register-device", { method: "POST", cache: "no-store" }).catch(() => undefined);
          await fetch("/api/eixpay/referral/apply", { method: "POST", cache: "no-store" }).catch(() => undefined);
          router.replace("/account");
          router.refresh();
        } else {
          setMessage("Sign-up successful. Confirm the link sent to your email, then verify your phone number with an OTP in your account.");
        }
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken },
      });
      resetCaptcha();

      if (error || !data.user) {
        setMessage("The email address or password is incorrect.");
        return;
      }

      await fetch("/api/account/security/register-device", { method: "POST", cache: "no-store" }).catch(() => undefined);
      router.replace(getSafeNextPath());
      router.refresh();
    } catch {
      resetCaptcha();
      setMessage("Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <Script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      onLoad={() => setTurnstileReady(true)}
      onError={() => setMessage("Could not load security verification. Refresh the page.")}
    />
    <main className="customer-auth">
      <section className="auth-brand-panel">
        <Link href="/" className="auth-brand">
          neweix<span>.</span>
        </Link>

        <div className="auth-brand-copy">
          <p className="auth-eyebrow">SMART SHOPPING, MADE SIMPLE</p>
          <h1>Your shopping, all in one place.</h1>
          <p>
            Sign in to manage your orders, deliveries, addresses, and preferences
            with ease.
          </p>
        </div>

        <p className="auth-brand-footer">NEWEIX · Your trusted online store</p>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <Link href="/" className="auth-mobile-brand">
            neweix<span>.</span>
          </Link>

          <p className="auth-eyebrow">WELCOME TO NEWEIX</p>
          <h2>{isSignUp ? "Create your NEWEIX account" : "Sign in to your account"}</h2>
          <p className="auth-subtitle">
            Sign up or sign in with Google or Facebook, or use your email.
          </p>
          {searchParams.get("referral") === "1" && (
            <p role="status" className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm leading-6" style={{ color: "var(--primary)" }}>
              Welcome to NEWEIX through a friend&apos;s invitation. Create an account, verify your phone number, and complete your first eligible order for a chance to receive an Eixon referral reward.
            </p>
          )}

          <button
            className="auth-social-button"
            type="button"
            disabled={busy}
            onClick={() => void signInWithProvider("google")}
          >
            <span className="auth-google-mark" aria-hidden="true">G</span>
            Continue with Google
          </button>

          <button
            className="auth-social-button"
            type="button"
            disabled={busy}
            onClick={() => void signInWithProvider("facebook")}
          >
            <span className="auth-facebook-mark" aria-hidden="true">f</span>
            Continue with Facebook
          </button>

          <div className="auth-divider">
            <span>Or continue with email</span>
          </div>

          <form className="auth-email-form" onSubmit={handleEmailAuth}>
            {isSignUp && (
              <>
                <label htmlFor="customer-full-name">Your name</label>
                <input id="customer-full-name" type="text" autoComplete="name" minLength={2} maxLength={100} required value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </>
            )}
            <label htmlFor="customer-email">Email address</label>
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
              <label htmlFor="customer-password">{isSignUp ? "Create a password" : "Password"}</label>
              <Link href="/auth/forgot-password">Forgot password?</Link>
            </div>

            <input
              id="customer-password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={isSignUp ? 8 : undefined}
              placeholder={isSignUp ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <div className="my-3 min-h-[65px]" ref={captchaContainerRef} aria-label="Cloudflare security verification" />

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
              <><Icon name={busy ? "refresh" : "user"} size={17} /> {busy ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}</>
            </button>
          </form>

          <p className="auth-privacy-note">
            {isSignUp ? "After signing up, verify your phone number with an OTP to enable additional account features." : "New customer? Use the option below to create an account with your email."}
          </p>

          <p className="auth-staff-note">
            {isSignUp ? "Already have an account?" : "Need to create an account?"}{" "}
            <button type="button" onClick={() => { setIsSignUp((value) => !value); setMessage(""); }} style={{ border: 0, padding: 0, background: "transparent", color: "var(--primary)", font: "inherit", fontWeight: 700, cursor: "pointer" }}>
              <><Icon name="user" size={15} /> {isSignUp ? "Sign in" : "Sign up"}</>
            </button>
          </p>

          <p className="auth-guest-note">
            You can place an order without an account. Sign up and verify your phone number by OTP to save orders to your account and access additional features.
          </p>

          <p className="auth-staff-note">
            Staff or administrator? <Link href="/auth/login">Staff sign-in</Link>
          </p>
        </div>
      </section>

      <style jsx>{`
        .customer-auth {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          background: var(--bg);
          color: var(--ink);
        }

        .auth-brand-panel {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: clamp(28px, 5vw, 72px);
          color: var(--ink);
          background:
            radial-gradient(ellipse at 10% 90%, var(--brand-forest) 0, transparent 45%),
            linear-gradient(145deg, var(--brand-forest), var(--brand-forest-deep));
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
          color: var(--primary);
        }

        .auth-brand-copy {
          max-width: 490px;
          padding: 54px 0;
        }

        .auth-eyebrow {
          color: var(--primary);
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
          color: var(--muted);
          line-height: 1.9;
        }

        .auth-brand-footer {
          color: var(--muted);
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
          color: var(--ink);
          margin-bottom: 40px;
        }

        .auth-form-wrap h2 {
          margin: 12px 0;
          color: var(--ink);
          font-size: clamp(25px, 3vw, 34px);
          line-height: 1.35;
        }

        .auth-subtitle {
          margin: 0 0 28px;
          color: var(--muted);
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
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          color: var(--ink);
          font: inherit;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
          transition: background 150ms, border-color 150ms;
        }

        .auth-social-button:hover:not(:disabled) {
          background: var(--surface-raised);
          border-color: var(--primary);
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
          background: var(--border);
        }

        .auth-email-form {
          display: grid;
          gap: 10px;
        }

        .auth-email-form label {
          color: var(--ink);
          font-size: 13px;
          font-weight: 700;
        }

        .auth-email-form input {
          width: 100%;
          min-height: 48px;
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 9px;
          outline: none;
          background: var(--surface);
          color: var(--ink);
          font: inherit;
          font-size: 14px;
        }

        .auth-email-form input:focus {
          border-color: var(--ink);
          box-shadow: 0 0 0 3px rgba(182,255,74,.12);
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
          color: var(--primary);
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
          background: var(--primary);
          color: #080b09;
          font: inherit;
          font-weight: 750;
          cursor: pointer;
        }

        .auth-submit-button:hover:not(:disabled) {
          background: var(--primary-hover);
        }

        .auth-message {
          margin: 8px 0 0;
          color: var(--danger);
          font-size: 13px;
          line-height: 1.7;
        }

        .auth-privacy-note,
        .auth-guest-note,
        .auth-staff-note {
          color: var(--muted);
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
    </>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
          Loading sign-in page...
        </main>
      }
    >
      <CustomerLoginForm />
    </Suspense>
  );
}