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

        // 1. লগইন করা আছে কি না যাচাই
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace("/auth/login");
          return;
        }

        if (!active) return;

        // 2. অ্যাকাউন্ট Supreme এবং সক্রিয় কি না যাচাই
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
          if (active) {
            setMessage(
              "এই অ্যাকাউন্টের Supreme MFA সেটআপের অনুমতি নেই।"
            );
          }
          return;
        }

        if (!active) return;

        // 3. ইতিমধ্যে AAL2 যাচাই সম্পন্ন হয়েছে কি না
        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

        if (!assuranceError && assurance?.currentLevel === "aal2") {
          router.replace("/supreme");
          return;
        }

        // 4. বিদ্যমান MFA factors পরীক্ষা
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();

        if (factorsError || !factors) {
          if (active) {
            setMessage(
              "MFA তথ্য পড়া যায়নি। আবার চেষ্টা করুন।"
            );
          }
          return;
        }

        // আগে থেকেই যাচাইকৃত TOTP থাকলে সেটআপের বদলে যাচাইকরণ পেজে যাও
        const verifiedFactor = factors.totp.find(
          (factor) => factor.status === "verified"
        );

        if (verifiedFactor) {
          router.replace("/auth/mfa");
          return;
        }

        // 5. আগের অসম্পূর্ণ TOTP সেটআপগুলো সরানো
        const unverifiedFactors = factors.all.filter(
          (factor) =>
            factor.factor_type === "totp" &&
            factor.status === "unverified"
        );

        for (const factor of unverifiedFactors) {
          if (!active) return;

          const { error: unenrollError } =
            await supabase.auth.mfa.unenroll({
              factorId: factor.id,
            });

          if (unenrollError) {
            if (active) {
              setMessage(
                "আগের অসম্পূর্ণ MFA সেটআপ সরানো যায়নি। আবার চেষ্টা করুন।"
              );
            }
            return;
          }
        }

        if (!active) return;

        // 6. নতুন Authenticator factor তৈরি
        const { data, error: enrollError } =
          await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: "Neweix Supreme Authenticator",
          });

        if (
          enrollError ||
          !data?.id ||
          !data?.totp?.secret
        ) {
          if (active) {
            setMessage(
              "MFA সেটআপ শুরু করা যায়নি। আবার চেষ্টা করুন।"
            );
          }
          return;
        }

        if (active) {
          setFactorId(data.id);
          setSecret(data.totp.secret);
          setMessage("");
        }
      } catch {
        if (active) {
          setMessage(
            "সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void setup();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    if (!factorId) {
      setMessage(
        "MFA সেটআপ প্রস্তুত হয়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।"
      );
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setMessage("Authenticator অ্যাপের ৬ সংখ্যার কোড লিখুন।");
      return;
    }

    if (busy) return;

    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();

      // বর্তমান লগইন সেশন পুনরায় যাচাই
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/auth/login");
        return;
      }

      // যাচাইয়ের আগে Supreme role ও active status পুনরায় পরীক্ষা
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
        setMessage(
          "এই অ্যাকাউন্টের Supreme MFA সেটআপের অনুমতি নেই।"
        );
        return;
      }

      // MFA challenge তৈরি
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({
          factorId,
        });

      if (challengeError || !challenge?.id) {
        setMessage(
          "MFA যাচাই শুরু করা যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।"
        );
        return;
      }

      // ব্যবহারকারীর ৬ সংখ্যার কোড যাচাই
      const { error: verifyError } =
        await supabase.auth.mfa.verify({
          factorId,
          challengeId: challenge.id,
          code,
        });

      if (verifyError) {
        setMessage(
          "কোডটি সঠিক নয় অথবা মেয়াদ শেষ হয়েছে। Authenticator-এর নতুন কোড দিন।"
        );
        return;
      }

      // সফল যাচাইয়ের পর AAL2 নিশ্চিত করা
      const {
        data: assurance,
        error: assuranceError,
      } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (
        assuranceError ||
        assurance?.currentLevel !== "aal2"
      ) {
        setMessage(
          "দুই ধাপের যাচাইকরণ সম্পন্ন হয়েছে কি না নিশ্চিত করা যায়নি। আবার চেষ্টা করুন।"
        );
        return;
      }

      router.replace("/supreme");
      router.refresh();
    } catch {
      setMessage(
        "MFA যাচাই করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="hero auth-page">
        <p>Supreme MFA সেটআপ পরীক্ষা হচ্ছে...</p>
      </main>
    );
  }

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · SUPREME SECURITY</p>

      <h1>দুই ধাপ যাচাইকরণ চালু করো</h1>

      <p className="hero-copy">
        Google Authenticator বা অন্য TOTP Authenticator অ্যাপে
        একটি নতুন অ্যাকাউন্ট যোগ করো। নিচের Secret Key ব্যবহার
        করে অ্যাকাউন্ট যোগ করার পর অ্যাপের বর্তমান ৬ সংখ্যার
        কোডটি এখানে লিখে যাচাই করো।
      </p>

      {secret && (
        <section className="track-form">
          <h2>Authenticator Secret Key</h2>

          <p className="hero-copy">
            <strong>{secret}</strong>
          </p>

          <p className="hero-copy">
            এই Secret Key অত্যন্ত সংবেদনশীল। এটি কাউকে পাঠাবে না,
            প্রকাশ করবে না এবং শেয়ার করা স্ক্রিনশটে রাখবে না।
          </p>
        </section>
      )}

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
          disabled={busy || !factorId}
          aria-describedby={message ? "mfa-message" : undefined}
        />

        {message && (
          <p
            id="mfa-message"
            role="alert"
            className="hero-copy"
          >
            {message}
          </p>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={busy || !factorId || code.length !== 6}
        >
          {busy
            ? "যাচাই হচ্ছে..."
            : "MFA যাচাই ও চালু করো"}
        </button>
      </form>

      <p className="hero-copy">
        <a href="/auth/logout">লগআউট</a>
      </p>
    </main>
  );
}