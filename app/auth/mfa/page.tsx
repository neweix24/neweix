"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function MfaPage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    setMessage("");

    if (!/^\d{6}$/.test(code)) {
      setMessage("Authenticator অ্যাপের ৬ সংখ্যার কোড দিন।");
      return;
    }

    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();

      // 1. বর্তমান লগইন সেশন যাচাই
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/auth/login");
        return;
      }

      // 2. Supreme Role এবং সক্রিয় অ্যাকাউন্ট যাচাই
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

      // 3. ইতিমধ্যে MFA সম্পন্ন হয়েছে কি না
      const {
        data: currentAssurance,
        error: currentAssuranceError,
      } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (
        !currentAssuranceError &&
        currentAssurance?.currentLevel === "aal2"
      ) {
        router.replace("/supreme");
        router.refresh();
        return;
      }

      // 4. যাচাইকৃত TOTP Factor খোঁজা
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (factorsError || !factors) {
        setMessage(
          "MFA তথ্য যাচাই করা যায়নি। আবার চেষ্টা করুন।"
        );
        return;
      }

      const factor = factors.totp.find(
        (item) => item.status === "verified"
      );

      if (!factor) {
        router.replace("/auth/mfa/setup");
        return;
      }

      // 5. MFA Challenge তৈরি
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({
          factorId: factor.id,
        });

      if (challengeError || !challenge?.id) {
        setMessage(
          "যাচাইকরণ শুরু করা যায়নি। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
        );
        return;
      }

      // 6. ব্যবহারকারীর কোড যাচাই
      const { error: verifyError } =
        await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.id,
          code,
        });

      if (verifyError) {
        setMessage(
          "কোডটি ভুল অথবা মেয়াদ শেষ হয়েছে। Authenticator-এর নতুন কোড দিন।"
        );
        return;
      }

      // 7. সফলতার পর AAL2 নিশ্চিত করা
      const {
        data: finalAssurance,
        error: finalAssuranceError,
      } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (
        finalAssuranceError ||
        finalAssurance?.currentLevel !== "aal2"
      ) {
        setMessage(
          "দুই ধাপের যাচাইকরণ নিশ্চিত করা যায়নি। আবার চেষ্টা করুন।"
        );
        return;
      }

      // 8. যাচাই সফল হলে Supreme Dashboard-এ যাওয়া
      router.replace("/supreme");
      router.refresh();
    } catch {
      setMessage(
        "যাচাইকরণে সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · SUPREME SECURITY</p>

      <h1>দুই ধাপের যাচাইকরণ</h1>

      <p className="hero-copy">
        Authenticator অ্যাপ থেকে বর্তমান ৬ সংখ্যার কোড লিখে
        Supreme অ্যাকাউন্টের যাচাইকরণ সম্পন্ন করো।
      </p>

      <form
        className="track-form"
        onSubmit={handleSubmit}
      >
        <label htmlFor="code">
          ৬ সংখ্যার যাচাইকরণ কোড
        </label>

        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(event) => {
            setCode(
              event.target.value.replace(/\D/g, "").slice(0, 6)
            );
          }}
          disabled={busy}
          aria-describedby={message ? "mfa-message" : undefined}
        />

        {message && (
          <p
            id="mfa-message"
            className="hero-copy"
            role="alert"
          >
            {message}
          </p>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={busy || code.length !== 6}
        >
          {busy ? "যাচাই হচ্ছে..." : "কোড যাচাই করুন"}
        </button>
      </form>

      <form action="/auth/logout" method="post">
        <button
          className="primary-button"
          type="submit"
        >
          লগআউট করুন
        </button>
      </form>
    </main>
  );
}