import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type PendingCookie = {
  name: string;
  value: string;
  options?: {
    path?: string;
    domain?: string;
    sameSite?: "strict" | "lax" | "none";
    secure?: boolean;
    httpOnly?: boolean;
    maxAge?: number;
    expires?: Date;
  };
};

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/account";
  }

  try {
    const parsed = new URL(value, "https://neweix.invalid");
    if (parsed.origin !== "https://neweix.invalid") return "/account";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/account";
  }
}

function applyPendingCookies(response: NextResponse, cookies: PendingCookie[]) {
  for (const cookie of cookies) {
    const isPkceVerifier = cookie.name.endsWith("-code-verifier");
    const options = isPkceVerifier
      ? {
          ...cookie.options,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const,
          path: "/",
          maxAge: 10 * 60,
        }
      : cookie.options;

    response.cookies.set(cookie.name, cookie.value, options);
  }
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    const response = NextResponse.redirect(
      new URL("/auth/customer-login?error=configuration", request.url),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const configuredSiteUrl = process.env.NEWEIX_SITE_URL;
  const siteOrigin = configuredSiteUrl
    ? new URL(configuredSiteUrl).origin
    : request.nextUrl.origin;
  const callbackUrl = new URL("/auth/callback", siteOrigin);
  callbackUrl.searchParams.set("next", next);

  const pendingCookies: PendingCookie[] = [];
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookieOptions: {
      path: "/",
      domain: process.env.NODE_ENV === "production" ? ".neweix.com" : undefined,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    console.error("Google OAuth initialization failed:", error?.message ?? "Missing provider URL");
    const response = NextResponse.redirect(
      new URL("/auth/customer-login?error=oauth_start_failed", request.url),
    );
    applyPendingCookies(response, pendingCookies);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const response = NextResponse.redirect(data.url, 302);
  applyPendingCookies(response, pendingCookies);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
