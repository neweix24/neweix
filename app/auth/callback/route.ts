import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminSupabaseClient } from "@/lib/phone-verification";

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
    const referralCode = request.cookies.get("neweix_referral_code")?.value;
    if (referralCode) {
      const { error: referralError } = await supabase.rpc("eixpay_apply_referral_code", {
        p_referral_code: referralCode,
      });
      if (referralError) console.warn("Customer referral attribution was not applied:", referralError.code);
      response.cookies.set("neweix_referral_code", "", {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", maxAge: 0,
      });
    }

    const { data: authData, error: userError } = await supabase.auth.getUser();
    const user = authData.user;

    if (!userError && user) {
      // Keep a random, first-party browser device ID. Never derive it from fingerprint data.
      const existingDeviceId = request.cookies.get("neweix_device_id")?.value;
      const deviceId = existingDeviceId && /^[0-9a-f-]{36}$/i.test(existingDeviceId)
        ? existingDeviceId
        : crypto.randomUUID();
      response.cookies.set("neweix_device_id", deviceId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });

      const userAgent = request.headers.get("user-agent")?.slice(0, 1000) ?? null;
      const ua = userAgent ?? "";
      const deviceType = /ipad|tablet/i.test(ua)
        ? "tablet"
        : /mobile|android|iphone|ipod/i.test(ua)
          ? "mobile"
          : ua ? "desktop" : "unknown";
      const operatingSystem =
        /Windows NT/i.test(ua) ? "Windows" :
        /Android/i.test(ua) ? "Android" :
        /iPhone|iPad|iPod/i.test(ua) ? "iOS" :
        /Mac OS X/i.test(ua) ? "macOS" :
        /Linux/i.test(ua) ? "Linux" : "unknown";
      const browser =
        /Edg\//i.test(ua) ? "Edge" :
        /Firefox\//i.test(ua) ? "Firefox" :
        /Chrome\//i.test(ua) && !/Edg\//i.test(ua) ? "Chrome" :
        /Safari\//i.test(ua) && !/Chrome\//i.test(ua) ? "Safari" : "unknown";

      try {
        const admin = createAdminSupabaseClient();
        const { error: deviceError } = await admin
          .from("customer_devices")
          .upsert({
            user_id: user.id,
            device_id: deviceId,
            device_type: deviceType,
            operating_system: operatingSystem,
            browser,
            user_agent: userAgent,
            last_seen_at: new Date().toISOString(),
          }, { onConflict: "user_id,device_id" });
        if (deviceError) console.warn("Customer device registration failed:", deviceError.message);
      } catch (deviceError) {
        console.warn("Customer device registry unavailable:", deviceError instanceof Error ? deviceError.message : "unknown error");
      }

      const metadata = user.user_metadata ?? {};
      const metadataName =
        typeof metadata.full_name === "string" ? metadata.full_name :
        typeof metadata.name === "string" ? metadata.name : null;
      const rawAvatar =
        typeof metadata.picture === "string" ? metadata.picture :
        typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
      const avatarUrl = rawAvatar && rawAvatar.startsWith("https://") ? rawAvatar : null;
      const rawLocale = typeof metadata.locale === "string" ? metadata.locale : null;
      const preferredLanguage = rawLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLocale) ? rawLocale : null;

      const { data: existingProfile, error: profileReadError } = await supabase
        .from("customer_profiles")
        .select("user_id,full_name,avatar_url,preferred_language")
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
            preferred_language: preferredLanguage ?? existingProfile.preferred_language,
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
            preferred_language: preferredLanguage,
          });
        if (profileInsertError) {
          console.error("Customer OAuth profile creation failed:", profileInsertError.message);
        }
      }
    }
  }

  return response;
}
