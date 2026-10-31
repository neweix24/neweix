"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ThemeSettings = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  button: string;
  buttonText: string;
  border: string;
};

const INITIAL_THEME: ThemeSettings = {
  background: "#080b09",
  surface: "#151d18",
  text: "#f4f8f2",
  muted: "#a0ada1",
  button: "#b6ff4a",
  buttonText: "#080b09",
  border: "#29352b",
};

const FIELDS: { key: keyof ThemeSettings; label: string }[] = [
  { key: "background", label: "পেজের ব্যাকগ্রাউন্ড" },
  { key: "surface", label: "কার্ড ও প্যানেলের রং" },
  { key: "text", label: "লেখার রং" },
  { key: "muted", label: "সহায়ক লেখার রং" },
  { key: "button", label: "বাটনের রং" },
  { key: "buttonText", label: "বাটনের লেখার রং" },
  { key: "border", label: "বর্ডারের রং" },
];

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  if (!channels || channels.length !== 3) return 0;
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function getContrastIssues(theme: ThemeSettings): string[] {
  const checks: [string, string, string, number][] = [
    ["প্রধান লেখা", theme.text, theme.background, 4.5],
    ["কার্ডের লেখা", theme.text, theme.surface, 4.5],
    ["সহায়ক লেখা ও ব্যাকগ্রাউন্ড", theme.muted, theme.background, 4.5],
    ["সহায়ক লেখা ও কার্ড", theme.muted, theme.surface, 4.5],
    ["বাটনের লেখা", theme.buttonText, theme.button, 4.5],
  ];

  return checks
    .filter(([, foreground, background, minimum]) =>
      contrastRatio(foreground, background) < minimum
    )
    .map(([label]) => label);
}

function sanitizeTheme(value: unknown): ThemeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return INITIAL_THEME;
  }

  const input = value as Record<string, unknown>;
  const result = { ...INITIAL_THEME };

  for (const field of FIELDS) {
    if (isHexColor(input[field.key])) {
      result[field.key] = input[field.key] as string;
    }
  }

  return result;
}

export default function CustomerThemePage() {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeSettings>(INITIAL_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTheme() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error: authError } =
          await supabase.auth.getUser();

        if (authError || !user) {
          router.replace("/auth/customer-login?next=/account/theme");
          return;
        }

        const { data, error } = await supabase
          .from("customer_theme_settings")
          .select("theme")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          throw new Error("থিম লোড করা যায়নি। আবার চেষ্টা করুন।");
        }

        if (active && data?.theme) {
          setTheme(sanitizeTheme(data.theme));
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "থিম লোড করা যায়নি।"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadTheme();

    return () => {
      active = false;
    };
  }, [router]);

  function updateColor(key: keyof ThemeSettings, value: string) {
    setTheme((current) => ({ ...current, [key]: value }));
    setMessage("");
    setErrorMessage("");
  }

  const contrastIssues = getContrastIssues(theme);

  async function saveTheme() {
    if (contrastIssues.length > 0) {
      setErrorMessage("রঙের কনট্রাস্ট যথেষ্ট নয়। সংরক্ষণের আগে নিচের রংগুলো ঠিক করুন।");
      return;
    }

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/auth/customer-login?next=/account/theme");
        return;
      }

      const { error } = await supabase
        .from("customer_theme_settings")
        .upsert(
          {
            user_id: user.id,
            theme,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) {
        throw new Error("থিম সংরক্ষণ হয়নি। আবার চেষ্টা করুন।");
      }

      setMessage("তোমার ব্যক্তিগত থিম সংরক্ষণ হয়েছে।");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "থিম সংরক্ষণ করা যায়নি।"
      );
    } finally {
      setSaving(false);
    }
  }

  const previewStyle = {
    backgroundColor: theme.background,
    color: theme.text,
    borderColor: theme.border,
  };

  return (
    <main className="theme-page" style={previewStyle}>
      <header className="theme-header">
        <Link href="/account" aria-label="অ্যাকাউন্টে ফিরে যাও">← অ্যাকাউন্ট</Link>
        <Link href="/" aria-label="হোম পেজ">⌂</Link>
      </header>

      <section className="theme-content">
        <p className="eyebrow">YOUR PERSONAL DESIGN</p>
        <h1>নিজের থিম নিজেই তৈরি করো</h1>
        <p className="description">
          রং বেছে নাও, প্রিভিউ দেখো এবং নিজের অ্যাকাউন্টের জন্য সংরক্ষণ করো।
        </p>

        {loading ? (
          <p role="status">থিম লোড হচ্ছে…</p>
        ) : (
          <>
            <section className="preview" style={{
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.border,
            }}>
              <p style={{ color: theme.muted }}>লাইভ প্রিভিউ</p>
              <h2>তোমার NEWEIX</h2>
              <p style={{ color: theme.muted }}>
                এই ডিজাইনটি তোমার পছন্দের রং অনুযায়ী দেখা যাবে।
              </p>
              <button
                type="button"
                style={{
                  backgroundColor: theme.button,
                  color: theme.buttonText,
                }}
              >
                নমুনা বাটন
              </button>
            </section>

            <section className="color-list">
              <h2>রং নির্বাচন</h2>
              <p className="contrast-help">
                লেখা ও বাটন স্পষ্ট রাখতে WCAG AA অনুযায়ী কনট্রাস্ট যাচাই করা হয়।
              </p>
              <p className={contrastIssues.length ? "contrast-warning" : "contrast-ok"} role="status">
                {contrastIssues.length
                  ? `যে জায়গায় কনট্রাস্ট বাড়াতে হবে: ${contrastIssues.join(", ")}।`
                  : "রঙের কনট্রাস্ট ঠিক আছে — থিম সংরক্ষণ করা যাবে।"}
              </p>
              {FIELDS.map((field) => (
                <label className="color-row" key={field.key}>
                  <span>{field.label}</span>
                  <span className="color-control">
                    <code>{theme[field.key]}</code>
                    <input
                      type="color"
                      aria-label={field.label}
                      value={theme[field.key]}
                      onChange={(event) =>
                        updateColor(field.key, event.target.value)
                      }
                    />
                  </span>
                </label>
              ))}
            </section>

            {message && <p className="success" role="status">{message}</p>}
            {errorMessage && <p className="error" role="alert">{errorMessage}</p>}

            <button
              className="save-button"
              type="button"
              onClick={saveTheme}
              disabled={saving || contrastIssues.length > 0}
              aria-describedby="theme-contrast-note"
            >
              {saving ? "সংরক্ষণ হচ্ছে…" : "থিম সংরক্ষণ করো"}
            </button>

            <button
              className="reset-button"
              type="button"
              onClick={() => {
                setTheme(INITIAL_THEME);
                setMessage("");
                setErrorMessage("");
              }}
            >
              রং নতুন করে বেছে নাও
            </button>
          </>
        )}
      </section>

      <style jsx>{`
        * { box-sizing: border-box; }
        .theme-page {
          min-height: 100vh;
          padding: 0 18px 48px;
          font-family: Arial, sans-serif;
        }
        .theme-header {
          max-width: 900px;
          min-height: 64px;
          margin: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid;
          border-color: inherit;
        }
        a { color: inherit; text-decoration: none; }
        .theme-content { max-width: 620px; margin: 32px auto; }
        .eyebrow { font-size: 12px; letter-spacing: 2px; opacity: .7; }
        h1 { font-size: clamp(26px, 5vw, 36px); margin: 12px 0; }
        .description { line-height: 1.7; opacity: .75; }
        .preview {
          margin: 26px 0;
          padding: 24px;
          border: 1px solid;
          border-radius: 16px;
          overflow-wrap: anywhere;
        }
        .preview h2 { margin: 12px 0; }
        .preview p { line-height: 1.7; }
        .preview button {
          border: 0;
          border-radius: 9px;
          padding: 12px 18px;
          margin-top: 8px;
          font: inherit;
        }
        .color-list {
          padding: 20px;
          border: 1px solid;
          border-color: inherit;
          border-radius: 14px;
        }
        .color-list h2 { font-size: 20px; margin-top: 0; }
        .color-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 13px 0;
          border-bottom: 1px solid;
          border-color: inherit;
        }
        .color-control {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .color-control code { font-size: 12px; }
        input[type="color"] {
          width: 42px;
          height: 36px;
          padding: 2px;
          border: 1px solid #999;
          border-radius: 7px;
          background: transparent;
          cursor: pointer;
        }
        .save-button, .reset-button {
          width: 100%;
          min-height: 48px;
          margin-top: 16px;
          padding: 12px;
          border: 1px solid;
          border-color: inherit;
          border-radius: 9px;
          font: inherit;
          cursor: pointer;
        }
        .save-button {
          background: var(--customer-theme-button, var(--primary));
          color: var(--customer-theme-button-text, #080b09);
        }
        .reset-button { background: transparent; color: inherit; }
        button:disabled { opacity: .6; cursor: wait; }
        .success { color: #16804a; }
        .error { color: #b42318; }
        .contrast-help { font-size: 13px; opacity: .78; }
        .contrast-warning { color: #b42318; font-size: 13px; font-weight: 700; }
        .contrast-ok { color: #16804a; font-size: 13px; font-weight: 700; }
        @media (max-width: 420px) {
          .color-row { align-items: flex-start; }
          .color-row > span:first-child { max-width: 55%; }
          .color-control { gap: 5px; }
          .color-control code { font-size: 10px; }
        }
      `}</style>
    </main>
  );
}