"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function SupremeMfaSetupPage() {
  const router = useRouter();

  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function setup() {
      try {
        const supabase = createBrowserSupabaseClient();

        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          router.replace("/auth/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("staff_profiles")
          .select("role, is_active")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (
          profileError ||
          !profile ||
          profile.role !== "supreme" ||
          profile.is_active !== true
        ) {
          setMessage("এই অ্যাকাউন্টের Supreme MFA সেটআপের অনুমতি নেই।");
          return;
        }

        const { data: assurance } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

        if (assurance?.currentLevel === "aal2") {
          router.replace("/supreme");
          return;
        }

        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();

        if (factorsError) {
          setMessage("MFA তথ্য পড়া যায়নি। আবার চেষ্টা করুন।");
          return;
        }

        const verified = factors.totp.find(
          (factor) => factor.status === "verified"
        );

        if (verified) {
          router.replace("/auth/mfa");
          return;
        }

        const unverified = factors.all.find(
          (factor) =>
            factor.factor_type === "totp" &&
            factor.status === "unverified"
        );

        if (unverified) {
          const { error: unenrollError } =
            await supabase.auth.mfa.unenroll({
              factorId: unverified.id,
            });

          if (unenrollError) {
            setMessage(
              "আগের অসম্পূর্ণ MFA সেটআপ সরানো যায়নি। আবার চেষ্টা করুন।"
            );
            return;
          }
        }

        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Neweix Supreme Authenticator",
        });

        if (error || !data?.totp?.secret || !data.id) {
          setMessage("MFA সেটআপ শুরু করা যায়নি। আবার চেষ্টা করুন।");
          return;
        }

        if (active) {
          setSecret(data.totp.secret);
          setFactorId(data.id);
        }
      } catch {
        setMessage("সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      } finally {
        if (active) setLoading(false);
      }
    }

    void setup();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!/^\d{6}$/.test(code)) {
      setMessage("Authenticator-এর ৬ সংখ্যার কোড লিখুন।");
      return;
    }

    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });

      if (challengeError || !challenge) {
        setMessage("MFA যাচাই শুরু করা যায়নি। আবার চেষ্টা করুন।");
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });

      if (verifyError) {
        setMessage("কোড সঠিক নয় বা মেয়াদ শেষ হয়েছে। নতুন কোড দিন।");
        return;
      }

      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (assuranceError || assurance.currentLevel !== "aal2") {
        setMessage("দুই ধাপ যাচাইকরণ সম্পন্ন হয়নি। আবার চেষ্টা করুন।");
        return;
      }

      router.replace("/supreme");
      router.refresh();
    } catch {
      setMessage("MFA যাচাই করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="hero">
        <p>Supreme MFA সেটআপ পরীক্ষা হচ্ছে...</p>
      </main>
    );
  }

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · SUPREME SECURITY</p>
      <h1>দুই ধাপ যাচাইকরণ চালু করো</h1>
      <p className="hero-copy">
        Authenticator অ্যাপে একটি নতুন অ্যাকাউন্ট যোগ করে নিচের Secret Key
        সংরক্ষণ করো। এরপর অ্যাপের বর্তমান ৬ সংখ্যার কোড লিখে যাচাই করো।
      </p>

      {secret && (
        <section>
          <h2>Authenticator Secret Key</h2>
          <p className="hero-copy">
            <strong>{secret}</strong>
          </p>
          <p className="hero-copy">
            এই Secret Key কাউকে দেবে না। নিরাপদে সংরক্ষণ করো।
          </p>
        </section>
      )}

      <form className="track-form" onSubmit={handleSubmit}>
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
          disabled={busy || !factorId}
        >
          {busy ? "যাচাই হচ্ছে..." : "MFA যাচাই ও চালু করো"}
        </button>
      </form>

      <p className="hero-copy">
        <a href="/auth/logout">লগআউট</a>
      </p>
    </main>
  );
}