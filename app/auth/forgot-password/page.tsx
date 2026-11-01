"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Script from "next/script";
import Link from "next/link";
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const captchaWidgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !turnstileReady ||
      !captchaContainerRef.current ||
      !window.turnstile ||
      captchaWidgetIdRef.current
    ) return;

    captchaWidgetIdRef.current = window.turnstile.render(
      captchaContainerRef.current,
      {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "auto",
        callback: (token) => {
          setCaptchaToken(token);
          setMessage("");
        },
        "expired-callback": () => setCaptchaToken(""),
        "error-callback": () => {
          setCaptchaToken("");
          setMessage("Security verification was not completed. Please try again.");
        },
      }
    );

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!captchaToken) {
      setMessage("Complete security verification first.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          captchaToken,
        }),
      });

      const data: { message?: string; error?: string } =
        await response.json();

      if (!response.ok) {
        setMessage(
          data.error ?? "Something went wrong. Please try again in a moment."
        );
        resetCaptcha();
        return;
      }

      setMessage(
        data.message ??
          "If password sign-in is enabled for this email address, password reset instructions will be sent."
      );
      resetCaptcha();
    } catch {
      setMessage("A connection error occurred. Please try again.");
      resetCaptcha();
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
      <main className="hero auth-page">
        <p className="eyebrow">NEWEIX · ACCOUNT RECOVERY</p>
        <h1>Reset password</h1>
        <p className="hero-copy">
          আপনার অ্যাকাউন্টের Email দিন। Reset passwordের নির্দেশনা
          if password sign-in is enabled.
        </p>

        <form className="track-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
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

          <div
            className="my-3 min-h-[65px]"
            ref={captchaContainerRef}
            aria-label="Cloudflare security verification"
          />

          {message && (
            <p role="status" aria-live="polite" className="hero-copy">
              {message}
            </p>
          )}

          <button className="primary-button" type="submit" disabled={busy}>
            <><Icon name={busy ? "refresh" : "mail"} size={17} /> {busy ? "Verifying…" : "Send reset link"}</>
          </button>
        </form>

        <p className="hero-copy">
          <Link href="/auth/customer-login">Return to sign-in</Link>
        </p>
      </main>
    </>
  );
}
