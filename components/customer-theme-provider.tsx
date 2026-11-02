"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const DEFAULT_THEME = {
  background: "#ffffff",
  surface: "#ffffff",
  text: "#17211a",
  muted: "#59665d",
  button: "#b6ff4a",
  buttonText: "#080b09",
  border: "#e2e8e3",
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
  if (!value || typeof value !== "object" || Array.isArray(value)) return theme;
  const input = value as Record<string, unknown>;
  for (const key of COLOR_KEYS) {
    if (isHexColor(input[key])) theme[key] = input[key];
  }
  return theme;
}

// Only public shopping/marketing pages inherit customer-selected colors.
// Account, wallet, checkout, authentication and every workspace stay system-controlled.
function isStorefrontPage(pathname: string): boolean {
  const excludedPrefixes = [
    "/admin", "/staff", "/supreme", "/dashboard", "/account",
    "/wallet", "/checkout", "/auth", "/orders", "/api",
  ];
  return !excludedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

export default function CustomerThemeProvider() {
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const body = document.body;

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
      body.removeAttribute("data-customer-theme");
      for (const name of Object.values(variableNames)) {
        body.style.removeProperty(name);
      }
    }

    function applyTheme(value: unknown) {
      const theme = validateTheme(value);
      for (const key of COLOR_KEYS) {
        body.style.setProperty(variableNames[key], theme[key]);
      }
      body.setAttribute("data-customer-theme", "storefront");
    }

    clearTheme();
    if (!isStorefrontPage(pathname)) {
      return () => {
        active = false;
        clearTheme();
      };
    }

    const supabase = createBrowserSupabaseClient();

    let currentUserId: string | null = null;

    async function loadTheme(userId?: string) {
      const currentRequest = ++requestVersion;
      clearTheme();
      try {
        let resolvedUserId: string | null = userId ?? null;
        if (!resolvedUserId) {
          const { data: { session }, error: sessionError } =
            await supabase.auth.getSession();
          if (sessionError || !session?.user) {
            currentUserId = null;
            return;
          }
          resolvedUserId = session.user.id;
        }

        currentUserId = resolvedUserId;
        if (!active || currentRequest !== requestVersion) return;

        const { data, error } = await supabase
          .from("customer_theme_settings")
          .select("theme")
          .eq("user_id", resolvedUserId)
          .maybeSingle();

        if (!active || currentRequest !== requestVersion) return;
        if (!error && data?.theme) applyTheme(data.theme);
      } catch {
        if (active && currentRequest === requestVersion) clearTheme();
      }
    }

    void loadTheme();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((
      event: AuthChangeEvent,
      session: Session | null
    ) => {
      // Token refreshes do not change the customer identity. Do not issue
      // another auth lookup or theme request for every refresh event.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;

      const nextUserId = session?.user?.id ?? null;
      if (nextUserId === currentUserId) return;

      currentUserId = nextUserId;
      clearTheme();
      requestVersion += 1;
      if (nextUserId) {
        queueMicrotask(() => {
          if (active) void loadTheme(nextUserId);
        });
      }
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
