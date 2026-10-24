"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function MfaSetupPage() {
  const router = useRouter();

  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    setMessage("");

    try {
      const supabase = createBrowserSupabaseClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/auth/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("role, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        profileError ||
        !profile ||
        profile.role !== "supreme" ||
        profile.is_active !== true
      ) {
        await supabase.auth.signOut();
        router.replace("/unauthorized");
        return;
      }

      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (factorsError) {
        setMessage("MFA তথ্য যাচাই করা যায়নি। আবার চেষ্টা করুন।");
        return;
      }

      const verifiedFactor = factors.totp.find(
        (factor) => factor.status === "verified"
      );

      if (verifiedFactor) {
        router.replace("/auth/mfa");
        return;
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Neweix Supreme Authenticator",
      });

      if (error || !data?.totp?.secret || !data.id) {
        setMessage(
          error?.message ||
            "Authenticator সেটআপ শুরু করা যায়নি। আবার চেষ্টা করুন।"
        );
        return;
      }

      setSecret(data.totp.secret);
      setFactorId(data.id);
    } catch {
      setMessage("সেটআপ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  async function verifySetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!factorId || !/^\d{6}$/.test(code)) {
      setMessage("Authenticator-এর ৬ সংখ্যার কোড দিন।");
      return;
    }

    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });

      if (error) {
        setMessage("কোডটি ভুল বা মেয়াদোত্তীর্ণ। আবার চেষ্টা করুন।");
        return;
      }

      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (assuranceError || assurance.currentLevel !== "aal2") {
        setMessage("দুই ধাপের যাচাইকরণ নিশ্চিত হয়নি। আবার চেষ্টা করুন।");
        return;
      }

      router.replace("/supreme");
      router.refresh();
    } catch {
      setMessage("যাচাইকরণে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · SUPREME SECURITY</p>
      <h1>Authenticator সেটআপ</h1>

      <p className="hero-copy">
        Supreme অ্যাকাউন্টের নিরাপত্তার জন্য Authenticator অ্যাপ
        সেটআপ করুন।
      </p>

      {!secret ? (
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={startSetup}
        >
          {busy ? "প্রস্তুত হচ্ছে…" : "সেটআপ শুরু করুন"}
        </button>
      ) : (
        <>
          <p className="hero-copy">
            আপনার Authenticator অ্যাপে একটি নতুন TOTP অ্যাকাউন্ট যোগ করুন।
            অ্যাপ চাইলে নিচের Secret Key হাতে লিখে দিন।
          </p>

          <p><strong>Secret Key</strong></p>
          <p style={{ overflowWrap: "anywhere" }}>{secret}</p>

          <p className="hero-copy">
            Secret Key কাউকে দেবেন না বা স্ক্রিনশট শেয়ার করবেন না।
          </p>

          <form className="track-form" onSubmit={verifySetup}>
            <label htmlFor="code">৬ সংখ্যার যাচাইকরণ কোড</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />

            {message && <p role="alert">{message}</p>}

            <button
              className="primary-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "যাচাই হচ্ছে…" : "কোড যাচাই করুন"}
            </button>
          </form>
        </>
      )}

      {message && !secret && <p role="alert">{message}</p>}

      <p className="hero-copy">
        <a href="/">হোম পেজে ফিরুন</a>
      </p>
    </main>
  );
}