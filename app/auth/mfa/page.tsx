"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function MfaPage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!/^\d{6}$/.test(code)) {
      setMessage("৬ সংখ্যার যাচাইকরণ কোড দিন।");
      return;
    }

    setBusy(true);

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

      const factor = factors.totp.find(
        (item) => item.status === "verified"
      );

      if (!factor) {
        setMessage(
          "আপনার অ্যাকাউন্টে Authenticator সেটআপ নেই। আগে MFA সেটআপ করতে হবে।"
        );
        return;
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({
          factorId: factor.id,
        });

      if (challengeError || !challenge) {
        setMessage("যাচাইকরণ শুরু করা যায়নি। আবার চেষ্টা করুন।");
        return;
      }

      const { error: verifyError } =
        await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.id,
          code,
        });

      if (verifyError) {
        setMessage("কোডটি ভুল বা মেয়াদোত্তীর্ণ। আবার চেষ্টা করুন।");
        return;
      }

      const { data: assurance } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (assurance?.currentLevel !== "aal2") {
        setMessage("দ্বিতীয় ধাপ সম্পন্ন হয়নি। আবার চেষ্টা করুন।");
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
      <h1>দুই ধাপের যাচাইকরণ</h1>
      <p className="hero-copy">
        আপনার Authenticator অ্যাপ থেকে বর্তমান ৬ সংখ্যার কোড দিন।
      </p>

      <form className="track-form" onSubmit={handleSubmit}>
        <label htmlFor="code">যাচাইকরণ কোড</label>
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

        {message && <p role="alert" className="hero-copy">{message}</p>}

        <button
          className="primary-button"
          type="submit"
          disabled={busy}
        >
          {busy ? "যাচাই হচ্ছে…" : "কোড যাচাই করুন"}
        </button>
      
      </form>

      <form action="/auth/logout" method="post">
        <button className="primary-button" type="submit">
          লগআউট করুন
        </button>
      </form>


    </main>
  );
}