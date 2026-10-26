"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const DEFAULT_THEME = {
  background: "#f5f5f5",
  surface: "#ffffff",
  text: "#222222",
  muted: "#666666",
  button: "#333333",
  buttonText: "#ffffff",
  border: "#dddddd",
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

    clearTheme();

    if (!isCustomerPage) {
      return () => {
        active = false;
        clearTheme();
      };
    }

    async function loadTheme() {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active || !user) return;

        const { data, error } = await supabase
          .from("customer_theme_settings")
          .select("theme")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!active || error || !data?.theme) return;

        const theme = validateTheme(data.theme);

        for (const key of COLOR_KEYS) {
          root.style.setProperty(
            variableNames[key],
            theme[key]
          );
        }
      } catch {
        // থিম লোড না হলেও ওয়েবসাইট স্বাভাবিকভাবে চলবে।
      }
    }

    void loadTheme();

    return () => {
      active = false;
      clearTheme();
    };
  }, [pathname]);

  return null;
}