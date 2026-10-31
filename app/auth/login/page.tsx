"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";

const TURNSTILE_SITE_KEY = "0x4AAAAAAFuD44weVKxUV7gX";

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
      remove: (widgetId?: string) => void;
    };
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);
  const captchaContainer = useRef<HTMLDivElement>(null);
  const captchaWidgetId = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const renderCaptcha = () => {
      if (
        disposed ||
        !window.turnstile ||
        !captchaContainer.current ||
        captchaWidgetId.current
      ) {
        return;
      }

      captchaWidgetId.current = window.turnstile.render(
        captchaContainer.current,
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
            setMessage("নিরাপত্তা যাচাই লোড হয়নি। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।");
          },
        }
      );
      setCaptchaReady(true);
    };

    if (window.turnstile) {
      renderCaptcha();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]'
      );
      const script = existingScript ?? document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderCaptcha);
      if (!existingScript) document.head.appendChild(script);
    }

    return () => {
      disposed = true;
      if (captchaWidgetId.current && window.turnstile) {
        window.turnstile.remove(captchaWidgetId.current);
        captchaWidgetId.current = null;
      }
    };
  }, []);

  function navigateAfterAuth(path: string) {
    window.location.replace(path);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    if (!captchaToken) {
      setMessage("লগইনের আগে নিরাপত্তা যাচাই সম্পন্ন করুন।");
      return;
    }

    setMessage("");
    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken },
      });
      setCaptchaToken("");

      if (error || !data.user) {
        if (window.turnstile && captchaWidgetId.current) {
          window.turnstile.reset(captchaWidgetId.current);
        }
        if (error?.message.toLowerCase().includes("captcha")) {
          setMessage("নিরাপত্তা যাচাই ব্যর্থ হয়েছে। আবার CAPTCHA সম্পন্ন করে চেষ্টা করুন।");
        } else {
          setMessage("ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।");
        }
        return;
      }

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

        <div
          ref={captchaContainer}
          aria-label="Cloudflare Turnstile security verification"
          className="my-4"
        />
        {!captchaReady && (
          <p className="hero-copy">নিরাপত্তা যাচাই লোড হচ্ছে…</p>
        )}

        <p>
          <Link href="/auth/forgot-password">
            পাসওয়ার্ড ভুলে গেছেন?
          </Link>
        </p>

        {message && <p role="alert">{message}</p>}

        <button
          className="primary-button"
          type="submit"
          disabled={busy || !captchaToken}
        >
          <><Icon name={busy ? "refresh" : "user"} size={17} /> {busy ? "লগইন হচ্ছে…" : "লগইন করুন"}</>
        </button>
      </form>

      <p className="hero-copy">
        <Link href="/">← হোম পেজে ফিরুন</Link>
      </p>
    </main>
  );
}
