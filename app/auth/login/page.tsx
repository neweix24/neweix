"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";

const TURNSTILE_SITE_KEY = "0x4AAAAAAFuD44weVKxUV7gX";

type TurnstileApi = {
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

function getTurnstile() {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
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
      const turnstile = getTurnstile();
      if (
        disposed ||
        !turnstile ||
        !captchaContainer.current ||
        captchaWidgetId.current
      ) {
        return;
      }

      captchaWidgetId.current = turnstile.render(
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
            setMessage("Security verification did not load. Refresh the page and try again.");
          },
        }
      );
      setCaptchaReady(true);
    };

    if (getTurnstile()) {
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
      const turnstile = getTurnstile();
      if (captchaWidgetId.current && turnstile) {
        turnstile.remove(captchaWidgetId.current);
        captchaWidgetId.current = null;
      }
    };
  }, []);

  function getSafeStaffNextPath(): string {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
      return "/admin";
    }

    try {
      const target = new URL(next, window.location.origin);
      if (
        target.origin !== window.location.origin ||
        (target.pathname !== "/admin" && !target.pathname.startsWith("/admin/"))
      ) {
        return "/admin";
      }
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return "/admin";
    }
  }

  function navigateAfterAuth(path: string) {
    window.location.replace(path);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    if (!captchaToken) {
      setMessage("Complete security verification before signing in.");
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
        const turnstile = getTurnstile();
        if (turnstile && captchaWidgetId.current) {
          turnstile.reset(captchaWidgetId.current);
        }
        if (error?.message.toLowerCase().includes("captcha")) {
          setMessage("Security verification failed. Complete the CAPTCHA again and retry.");
        } else {
          setMessage("The email address or password is incorrect.");
        }
        return;
      }

      // signInWithPassword already returns the newly issued session.
      // Re-reading it immediately can race cookie storage/refresh handling.
      // Validate the actual sign-in response instead of triggering another
      // auth read/refresh before continuing.
      if (
        !data.session?.access_token ||
        !data.session?.refresh_token ||
        data.session.user.id !== data.user.id
      ) {
        setMessage("A sign-in session could not be created. Complete the CAPTCHA and try again.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("role, is_active")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileError) {
        setMessage("Could not verify the staff account. Check database permissions and connectivity.");
        return;
      }

      if (
        !profile ||
        profile.is_active !== true ||
        !["supreme", "admin", "manager", "employee", "staff"].includes(profile.role)
      ) {
        await supabase.auth.signOut();
        setMessage("This account is not authorized to access the staff panel.");
        return;
      }

      if (profile.role === "supreme") {
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();

        if (factorsError) {
          setMessage("Could not verify MFA information. Please try again.");
          return;
        }

        const verifiedFactor = factors.totp.find(
          (factor: { status: string }) => factor.status === "verified"
        );

        if (!verifiedFactor) {
          navigateAfterAuth("/auth/mfa/setup");
          return;
        }

        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

        if (assuranceError) {
          setMessage("Could not complete security verification. Please try again.");
          return;
        }

        if (assurance.currentLevel !== "aal2") {
          navigateAfterAuth("/auth/mfa");
          return;
        }

        navigateAfterAuth("/supreme");
        return;
      }

      if (profile.role === "manager") {
        navigateAfterAuth("/manager");
        return;
      }
      if (profile.role === "employee") {
        navigateAfterAuth("/employee");
        return;
      }
      navigateAfterAuth(getSafeStaffNextPath());
    } catch {
      setMessage("Could not sign in. Check Supabase environment variables and network connectivity.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero auth-page premium-auth-page">
      <p className="eyebrow">NEWEIX · STAFF ACCESS</p>
      <h1>Secure staff sign-in</h1>
      <p className="hero-copy">
        Only active and authorized staff accounts can sign in here.
      </p>

      <form className="track-form" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
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
          aria-label={showPassword ? "Hide password" : "Show password"}
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
          <p className="hero-copy">Loading security verification…</p>
        )}

        <p>
          <Link href="/auth/forgot-password">
            Forgot password?
          </Link>
        </p>

        {message && <p role="alert">{message}</p>}

        <button
          className="primary-button"
          type="submit"
          disabled={busy || !captchaToken}
        >
          <><Icon name={busy ? "refresh" : "user"} size={17} /> {busy ? "Signing in…" : "Sign in"}</>
        </button>
      </form>

      <p className="hero-copy">
        <Link href="/">← Return to home</Link>
      </p>
    </main>
  );
}
