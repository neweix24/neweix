"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const DEFAULT_THEME = {
  background: "#ffffff",
  surface: "#151d18",
  text: "#f4f8f2",
  muted: "#a0ada1",
  button: "#b6ff4a",
  buttonText: "#080b09",
  border: "#29352b",
};

const COLOR_KEYS = [
  "background",
  "surface",
  "text",
  "muted",
  "button",
  "buttonText",
  "border",
] as const;

type Theme = typeof DEFAULT_THEME;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function validateTheme(value: unknown): Theme {
  const theme = { ...DEFAULT_THEME };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return theme;
  }

  const input = value as Record<string, unknown>;

  for (const key of COLOR_KEYS) {
    if (isHexColor(input[key])) {
      theme[key] = input[key];
    }
  }

  return theme;
}

export default function CustomerThemeProvider() {
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const root = document.documentElement;

    const isAdminPage =
      pathname === "/admin" || pathname.startsWith("/admin/");

    const isCustomerPage =
      !isAdminPage &&
      !pathname.startsWith("/auth/");

    const variableNames: Record<keyof Theme, string> = {
      background: "--customer-theme-background",
      surface: "--customer-theme-surface",
      text: "--customer-theme-text",
      muted: "--customer-theme-muted",
      button: "--customer-theme-button",
      buttonText: "--customer-theme-button-text",
      border: "--customer-theme-border",
    };

    function clearTheme() {
      for (const name of Object.values(variableNames)) {
        root.style.removeProperty(name);
      }
    }

    function applyTheme(value: unknown) {
      const theme = validateTheme(value);
      for (const key of COLOR_KEYS) {
        root.style.setProperty(variableNames[key], key === "background" ? "#ffffff" : theme[key]);
      }
    }

    clearTheme();

    if (!isCustomerPage) {
      return () => {
        active = false;
        clearTheme();
      };
    }

    const supabase = createBrowserSupabaseClient();

    async function loadTheme() {
      const currentRequest = ++requestVersion;

      // Never leave the previous account's colors visible while identity changes.
      clearTheme();

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (!active || currentRequest !== requestVersion) return;
        if (authError || !user) return;

        const { data, error } = await supabase
          .from("customer_theme_settings")
          .select("theme")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!active || currentRequest !== requestVersion) return;
        if (error || !data?.theme) return;

        applyTheme(data.theme);
      } catch {
        // থিম লোড না হলেও ওয়েবসাইট স্বাভাবিকভাবে চলবে।
        if (active && currentRequest === requestVersion) clearTheme();
      }
    }

    // Load the signed-in user's theme on page entry.
    void loadTheme();

    // Also reload/clear immediately when the signed-in account changes,
    // including sign-out and sign-in without a route change.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      clearTheme();
      requestVersion += 1;
      queueMicrotask(() => {
        if (active) void loadTheme();
      });
    });

    return () => {
      active = false;
      requestVersion += 1;
      subscription.unsubscribe();
      clearTheme();
    };
  }, [pathname]);

  return null;
}
