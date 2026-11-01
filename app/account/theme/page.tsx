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
  background: "#ffffff",
  surface: "#f8faf8",
  text: "#17211a",
  muted: "#59665d",
  button: "#b6ff4a",
  buttonText: "#080b09",
  border: "#e2e8e3",
};

const FIELDS: { key: keyof ThemeSettings; label: string }[] = [
  { key: "background", label: "Page background" },
  { key: "surface", label: "Card and panel colour" },
  { key: "text", label: "Text colour" },
  { key: "muted", label: "Muted text colour" },
  { key: "button", label: "Button colour" },
  { key: "buttonText", label: "Button text colour" },
  { key: "border", label: "Border colour" },
];

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function relativeLuminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
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
    ["Primary text", theme.text, theme.background, 4.5],
    ["Card text", theme.text, theme.surface, 4.5],
    ["Muted text and background", theme.muted, theme.background, 4.5],
    ["Muted text and card", theme.muted, theme.surface, 4.5],
    ["Button text", theme.buttonText, theme.button, 4.5],
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
          throw new Error("Could not load the theme. Please try again.");
        }

        if (active && data?.theme) {
          setTheme(sanitizeTheme(data.theme));
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "Could not load the theme."
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
      setErrorMessage("Colour contrast is insufficient. Adjust the colours below before saving.");
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
        throw new Error("The theme was not saved. Please try again.");
      }

      setMessage("Your personal theme has been saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save the theme."
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
        <Link href="/account" aria-label="Return to account">← Account</Link>
        <Link href="/" aria-label="Home page">⌂</Link>
      </header>

      <section className="theme-content">
        <p className="eyebrow">YOUR PERSONAL DESIGN</p>
        <h1>Create your own theme</h1>
        <p className="description">
          Choose colours, preview your design, and save it for the public NEWEIX website only.
        </p>

        {loading ? (
          <p role="status">Loading theme…</p>
        ) : (
          <>
            <section className="preview" style={{
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.border,
            }}>
              <p style={{ color: theme.muted }}>Live preview</p>
              <h2>Your NEWEIX</h2>
              <p style={{ color: theme.muted }}>
                These colours apply only to public website pages. Account, wallet, checkout, and administration areas will remain unchanged.
              </p>
              <button
                type="button"
                style={{
                  backgroundColor: theme.button,
                  color: theme.buttonText,
                }}
              >
                Sample button
              </button>
            </section>

            <section className="color-list">
              <h2>Choose colours</h2>
              <p className="contrast-help">
                Contrast is checked against WCAG AA to keep text and buttons readable.
              </p>
              <p id="theme-contrast-note" className={contrastIssues.length ? "contrast-warning" : "contrast-ok"} role="status">
                {contrastIssues.length
                  ? `Areas that need higher contrast: ${contrastIssues.join(", ")}।`
                  : "Colour contrast is sufficient — the theme can be saved."}
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
              {saving ? "Saving…" : "Save theme"}
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
              Choose colours again
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