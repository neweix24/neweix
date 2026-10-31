import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
    return redirectTo(
      request,
      isCustomerFlow
        ? "/auth/customer-login?error=oauth_failed"
        : "/auth/forgot-password?error=invalid_or_expired"
    );
  }

  if (!code) {
    return redirectTo(
      request,
      isCustomerFlow
        ? "/auth/customer-login?error=missing_code"
        : "/auth/forgot-password?error=missing_code"
    );
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

  // Session cookies must be attached to the response returned to the browser.
  const response = NextResponse.redirect(new URL(next, request.url));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Supabase callback exchange failed:", error.message);

    return redirectTo(
      request,
      isCustomerFlow
        ? "/auth/customer-login?error=oauth_failed"
        : "/auth/forgot-password?error=invalid_or_expired"
    );
  }

  if (isCustomerFlow) {
    const { data: authData, error: userError } = await supabase.auth.getUser();
    const user = authData.user;

    if (!userError && user) {
      const metadata = user.user_metadata ?? {};
      const metadataName =
        typeof metadata.full_name === "string" ? metadata.full_name :
        typeof metadata.name === "string" ? metadata.name : null;
      const rawAvatar =
        typeof metadata.picture === "string" ? metadata.picture :
        typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
      const avatarUrl = rawAvatar && rawAvatar.startsWith("https://") ? rawAvatar : null;

      const { data: existingProfile, error: profileReadError } = await supabase
        .from("customer_profiles")
        .select("user_id,full_name,avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileReadError) {
        console.error("Customer OAuth profile lookup failed:", profileReadError.message);
      } else if (existingProfile) {
        const { error: profileUpdateError } = await supabase
          .from("customer_profiles")
          .update({
            email: user.email ?? null,
            avatar_url: avatarUrl ?? existingProfile.avatar_url,
            full_name: existingProfile.full_name || metadataName,
          })
          .eq("user_id", user.id);
        if (profileUpdateError) {
          console.error("Customer OAuth profile sync failed:", profileUpdateError.message);
        }
      } else {
        const { error: profileInsertError } = await supabase
          .from("customer_profiles")
          .insert({
            user_id: user.id,
            email: user.email ?? null,
            full_name: metadataName,
            avatar_url: avatarUrl,
          });
        if (profileInsertError) {
          console.error("Customer OAuth profile creation failed:", profileInsertError.message);
        }
      }
    }
  }

  return response;
}
