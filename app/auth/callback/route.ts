import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/account";
  }

  try {
    const parsed = new URL(value, "https://neweix.invalid");

    if (parsed.origin !== "https://neweix.invalid") {
      return "/account";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/account";
  }
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  const isCustomerFlow =
    next === "/account" ||
    next.startsWith("/account/") ||
    next === "/orders" ||
    next.startsWith("/orders/");

  const errorParam = requestUrl.searchParams.get("error");

  if (errorParam) {
    const destination = isCustomerFlow
      ? "/auth/customer-login?error=oauth_failed"
      : "/auth/forgot-password?error=invalid_or_expired";

    return redirectTo(request, destination);
  }

  if (!code) {
    const destination = isCustomerFlow
      ? "/auth/customer-login?error=missing_code"
      : "/auth/forgot-password?error=missing_code";

    return redirectTo(request, destination);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return redirectTo(
      request,
      isCustomerFlow
        ? "/auth/customer-login?error=configuration"
        : "/auth/forgot-password?error=configuration"
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectTo(
      request,
      isCustomerFlow
        ? "/auth/customer-login?error=oauth_failed"
        : "/auth/forgot-password?error=invalid_or_expired"
    );
  }

  return redirectTo(request, next);
}