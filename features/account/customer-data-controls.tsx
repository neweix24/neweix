"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";

const CONSENT_VERSION = "2026-10-31";

type ConsentType = "marketing_email" | "marketing_sms";

export default function CustomerDataControls() {
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
        const { data: { session }, error: authError } = await supabase.auth.getSession();

        if (authError || !session?.user) {
          setErrorMessage("Your account session is temporarily unavailable. Please refresh this page.");
          return;
        }

        const [preferencesResult, consentsResult] = await Promise.all([
          supabase
            .from("customer_preferences")
            .select("preferred_sizes, preferred_colors")
            .eq("user_id", session.user.id)
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
            err instanceof Error ? err.message : "Could not load your information."
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
      setErrorMessage("You can add up to 20 sizes and 30 colours.");
      return;
    }
    if (
      [...preferredSizes, ...preferredColors].some((value) => value.length > 40)
    ) {
      setErrorMessage("Each preference can contain up to 40 characters.");
      return;
    }

    setSaving(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError || !session?.user) {
        setErrorMessage("Your account session is temporarily unavailable. Please refresh this page.");
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
      setMessage("Your preferences and communication consent have been saved.");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not save your information. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="data-page">
      <header className="data-header">
        <Link href="/" className="brand">NEWEIX</Link>
        <Link href="/account" className="back">← Back to account</Link>
      </header>

      <section className="panel">
        <p className="eyebrow">PRIVACY & PREFERENCES</p>
        <h1>Privacy & preferences</h1>
        <p className="intro">
          Save your shopping preferences and choose which channels NEWEIX may use
          to send promotional messages.
          Providing this information is optional. You can shop without it.
        </p>

        {loading ? (
          <p role="status">Loading information…</p>
        ) : (
          <form onSubmit={save}>
            <section className="group">
              <h2>Your preferences</h2>
              <label htmlFor="preferred-sizes">Preferred sizes</label>
              <input
                id="preferred-sizes"
                value={sizes}
                onChange={(event) => setSizes(event.target.value)}
                maxLength={500}
                placeholder="Example: S, M, L, XL"
              />
              <small>Separate entries with commas. Optional.</small>

              <label htmlFor="preferred-colors">Preferred colours</label>
              <input
                id="preferred-colors"
                value={colors}
                onChange={(event) => setColors(event.target.value)}
                maxLength={800}
                placeholder="Example: black, white, blue"
              />
              <small>Separate entries with commas. Optional.</small>
            </section>

            <section className="group">
              <h2>Communication preferences</h2>
              <p className="note">
                Essential messages about orders, payments, and delivery are separate from
                your marketing preferences.
              </p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={(event) => setEmailConsent(event.target.checked)}
                />
                <span>I would like to receive offers and new product updates by email.</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(event) => setSmsConsent(event.target.checked)}
                />
                <span>I would like to receive offers and new product updates by SMS.</span>
              </label>
              <p className="note">
                You can withdraw consent at any time. Each change, including its
                timestamp and status, is stored in a secure consent record.
              </p>
            </section>

            {message && <p className="success" role="status">{message}</p>}
            {errorMessage && <p className="error" role="alert">{errorMessage}</p>}

            <button type="submit" disabled={saving}>
              <><Icon name={saving ? "refresh" : "check"} size={16} /> {saving ? "Saving…" : "Save preferences"}</>
            </button>
          </form>
        )}
      </section>

      <style jsx>{`
        .data-page { min-height: 100vh; padding: 0 18px 56px; background: var(--bg); color: var(--ink); }
        .data-header { max-width: 900px; min-height: 68px; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); }
        .brand { color: var(--primary); font-weight: 800; letter-spacing: 2px; text-decoration: none; }
        .back { color: var(--muted); font-size: 14px; text-decoration: none; }
        .panel { box-sizing: border-box; max-width: 680px; margin: 36px auto; padding: 30px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: 0 12px 35px rgba(182,255,74,.08); }
        .eyebrow { color: var(--primary); font-size: 12px; font-weight: 700; letter-spacing: 2px; }
        h1 { margin: 8px 0; font-size: 30px; }
        .intro, .note { color: var(--muted); line-height: 1.7; }
        .group { display: grid; gap: 10px; margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--border); }
        h2 { margin: 0 0 4px; font-size: 19px; }
        label { font-size: 14px; font-weight: 600; }
        input:not([type="checkbox"]) { box-sizing: border-box; width: 100%; min-height: 46px; padding: 11px 12px; border: 1px solid var(--border); border-radius: 9px; color: var(--ink); background: var(--surface); font: inherit; }
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
