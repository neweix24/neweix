"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const CONSENT_VERSION = "2026-10-31";

type ConsentType = "marketing_email" | "marketing_sms";

export default function CustomerDataControls() {
  const router = useRouter();
  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [savedConsents, setSavedConsents] = useState<Record<ConsentType, boolean>>({
    marketing_email: false,
    marketing_sms: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError || !authData.user) {
          router.replace("/auth/customer-login?next=/account/privacy");
          return;
        }

        const [preferencesResult, consentsResult] = await Promise.all([
          supabase
            .from("customer_preferences")
            .select("preferred_sizes, preferred_colors")
            .eq("user_id", authData.user.id)
            .maybeSingle(),
          supabase
            .from("customer_consents")
            .select("consent_type, consented, created_at")
            .in("consent_type", ["marketing_email", "marketing_sms"])
            .order("created_at", { ascending: false }),
        ]);

        if (preferencesResult.error) throw preferencesResult.error;
        if (consentsResult.error) throw consentsResult.error;
        if (!active) return;

        setSizes((preferencesResult.data?.preferred_sizes ?? []).join(", "));
        setColors((preferencesResult.data?.preferred_colors ?? []).join(", "));

        const latest: Record<ConsentType, boolean> = {
          marketing_email: false,
          marketing_sms: false,
        };
        const seen = new Set<string>();

        for (const row of consentsResult.data ?? []) {
          const consentType = String(row.consent_type);
          if (
            (consentType === "marketing_email" ||
              consentType === "marketing_sms") &&
            !seen.has(consentType)
          ) {
            latest[consentType as ConsentType] = Boolean(row.consented);
            seen.add(consentType);
          }
        }

        setSavedConsents(latest);
        setEmailConsent(latest.marketing_email);
        setSmsConsent(latest.marketing_sms);
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof Error ? err.message : "তথ্য লোড করা যায়নি।"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    const preferredSizes = sizes
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const preferredColors = colors
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (preferredSizes.length > 20 || preferredColors.length > 30) {
      setErrorMessage("সাইজ সর্বোচ্চ ২০টি এবং রং সর্বোচ্চ ৩০টি দিতে পারবেন।");
      return;
    }
    if (
      [...preferredSizes, ...preferredColors].some((value) => value.length > 40)
    ) {
      setErrorMessage("প্রতিটি পছন্দ সর্বোচ্চ ৪০ অক্ষরের হতে পারবে।");
      return;
    }

    setSaving(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        router.replace("/auth/customer-login?next=/account/privacy");
        return;
      }

      const { error: preferencesError } = await supabase
        .from("customer_preferences")
        .upsert(
          {
            user_id: authData.user.id,
            preferred_sizes: preferredSizes,
            preferred_colors: preferredColors,
          },
          { onConflict: "user_id" }
        );

      if (preferencesError) throw preferencesError;

      const changedConsents = [
        {
          consent_type: "marketing_email" as const,
          consented: emailConsent,
          changed: emailConsent !== savedConsents.marketing_email,
        },
        {
          consent_type: "marketing_sms" as const,
          consented: smsConsent,
          changed: smsConsent !== savedConsents.marketing_sms,
        },
      ].filter((item) => item.changed);

      if (changedConsents.length > 0) {
        const { error: consentError } = await supabase
          .from("customer_consents")
          .insert(
            changedConsents.map((item) => ({
              user_id: authData.user!.id,
              consent_type: item.consent_type,
              consented: item.consented,
              policy_version: CONSENT_VERSION,
              source: "account_privacy_settings",
            }))
          );

        if (consentError) throw consentError;
      }

      setSavedConsents({
        marketing_email: emailConsent,
        marketing_sms: smsConsent,
      });
      setMessage("আপনার পছন্দ ও যোগাযোগের অনুমতি সংরক্ষণ করা হয়েছে।");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="data-page">
      <header className="data-header">
        <Link href="/" className="brand">NEWEIX</Link>
        <Link href="/account" className="back">← অ্যাকাউন্টে ফিরুন</Link>
      </header>

      <section className="panel">
        <p className="eyebrow">PRIVACY & PREFERENCES</p>
        <h1>গোপনীয়তা ও পছন্দ</h1>
        <p className="intro">
          আপনার কেনাকাটার পছন্দ সংরক্ষণ করুন এবং NEWEIX কোন মাধ্যমে
          প্রচারণামূলক বার্তা পাঠাতে পারবে তা নিয়ন্ত্রণ করুন।
          এই তথ্য দেওয়া ঐচ্ছিক; না দিলেও কেনাকাটা করতে পারবেন।
        </p>

        {loading ? (
          <p role="status">তথ্য লোড হচ্ছে…</p>
        ) : (
          <form onSubmit={save}>
            <section className="group">
              <h2>আপনার পছন্দ</h2>
              <label htmlFor="preferred-sizes">পছন্দের সাইজ</label>
              <input
                id="preferred-sizes"
                value={sizes}
                onChange={(event) => setSizes(event.target.value)}
                maxLength={500}
                placeholder="যেমন: S, M, L, XL"
              />
              <small>কমা দিয়ে আলাদা করুন। ঐচ্ছিক।</small>

              <label htmlFor="preferred-colors">পছন্দের রং</label>
              <input
                id="preferred-colors"
                value={colors}
                onChange={(event) => setColors(event.target.value)}
                maxLength={800}
                placeholder="যেমন: কালো, সাদা, নীল"
              />
              <small>কমা দিয়ে আলাদা করুন। ঐচ্ছিক।</small>
            </section>

            <section className="group">
              <h2>যোগাযোগের অনুমতি</h2>
              <p className="note">
                অর্ডার, পেমেন্ট ও ডেলিভারি সংক্রান্ত জরুরি বার্তা এই
                মার্কেটিং পছন্দ থেকে আলাদা।
              </p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={(event) => setEmailConsent(event.target.checked)}
                />
                <span>ইমেইলে অফার ও নতুন পণ্যের খবর পেতে চাই।</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(event) => setSmsConsent(event.target.checked)}
                />
                <span>SMS-এ অফার ও নতুন পণ্যের খবর পেতে চাই।</span>
              </label>
              <p className="note">
                অনুমতি যেকোনো সময় বন্ধ করতে পারবেন। প্রতিটি পরিবর্তনের
                সময় ও অবস্থা নিরাপদ সম্মতি-রেকর্ডে সংরক্ষিত হয়।
              </p>
            </section>

            {message && <p className="success" role="status">{message}</p>}
            {errorMessage && <p className="error" role="alert">{errorMessage}</p>}

            <button type="submit" disabled={saving}>
              {saving ? "সংরক্ষণ হচ্ছে…" : "পছন্দ সংরক্ষণ করুন"}
            </button>
          </form>
        )}
      </section>

      <style jsx>{`
        .data-page { min-height: 100vh; padding: 0 18px 56px; background: var(--bg); color: var(--ink); }
        .data-header { max-width: 900px; min-height: 68px; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); }
        .brand { color: var(--primary); font-weight: 800; letter-spacing: 2px; text-decoration: none; }
        .back { color: var(--muted); font-size: 14px; text-decoration: none; }
        .panel { box-sizing: border-box; max-width: 680px; margin: 36px auto; padding: 30px; border: 1px solid var(--border); border-radius: 16px; background: white; box-shadow: 0 12px 35px var(--primary)0a; }
        .eyebrow { color: var(--primary); font-size: 12px; font-weight: 700; letter-spacing: 2px; }
        h1 { margin: 8px 0; font-size: 30px; }
        .intro, .note { color: var(--muted); line-height: 1.7; }
        .group { display: grid; gap: 10px; margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--border); }
        h2 { margin: 0 0 4px; font-size: 19px; }
        label { font-size: 14px; font-weight: 600; }
        input:not([type="checkbox"]) { box-sizing: border-box; width: 100%; min-height: 46px; padding: 11px 12px; border: 1px solid var(--border); border-radius: 9px; color: var(--ink); background: white; font: inherit; }
        small { color: var(--muted); }
        .check-row { display: flex; align-items: flex-start; gap: 10px; font-weight: 500; line-height: 1.6; }
        .check-row input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--primary); }
        .note { margin: 0; font-size: 13px; }
        button { width: 100%; min-height: 48px; margin-top: 24px; padding: 12px; border: 0; border-radius: 9px; background: var(--primary); color: white; font: inherit; font-weight: 700; cursor: pointer; }
        button:disabled { opacity: .6; cursor: wait; }
        .success { color: var(--success); font-size: 14px; }
        .error { color: var(--danger); font-size: 14px; }
        @media (max-width: 520px) { .panel { margin-top: 22px; padding: 22px; } h1 { font-size: 26px; } }
      `}</style>
    </main>
  );
}
