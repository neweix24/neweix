import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Use one canonical hostname so browser auth cookies are never split between www and apex.
  if (request.nextUrl.hostname === "www.neweix.com") {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = "neweix.com";
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const pathname = request.nextUrl.pathname;
  const configuredSupremePath = process.env.SUPREME_PRIVATE_PATH;
  // The private entry must be one high-entropy path segment. Never accept a
  // public-looking or nested value that could overlap storefront routes.
  const hasValidPrivateSupremePath =
    typeof configuredSupremePath === "string" &&
    /^\/control-[A-Fa-f0-9]{48}$/.test(configuredSupremePath);
  const hasInvalidPrivateSupremePath =
    typeof configuredSupremePath === "string" &&
    configuredSupremePath.length > 0 &&
    !hasValidPrivateSupremePath;
  const hasMissingPrivateSupremePath =
    process.env.NODE_ENV === "production" &&
    !hasValidPrivateSupremePath;
  const isCanonicalSupremePath =
    pathname === "/supreme" || pathname.startsWith("/supreme/");
  const isPrivateSupremePath =
    hasValidPrivateSupremePath &&
    (pathname === configuredSupremePath ||
      pathname.startsWith(configuredSupremePath + "/"));

  // If a configured private path is malformed, fail closed instead of
  // silently exposing the legacy /supreme route.
  if ((hasInvalidPrivateSupremePath || hasMissingPrivateSupremePath) && isCanonicalSupremePath) {
    return new NextResponse("Supreme access is temporarily unavailable.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  // Once the private path is configured, direct requests to the old public
  // route are not served. The authenticated private alias is rewritten below.
  if (hasValidPrivateSupremePath && isCanonicalSupremePath) {
    const privatePath = configuredSupremePath!;
    // Existing in-workspace links still target the internal /supreme route.
    // Redirect those same-origin navigations back onto the private URL so the
    // browser never leaves the private path. Direct/external requests get 404.
    const referer = request.headers.get("referer");
    let cameFromPrivateEntry = false;
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        cameFromPrivateEntry =
          refererUrl.origin === request.nextUrl.origin &&
          (refererUrl.pathname === privatePath ||
            refererUrl.pathname.startsWith(privatePath + "/"));
      } catch {
        cameFromPrivateEntry = false;
      }
    }
    if (cameFromPrivateEntry) {
      const privateDestination = request.nextUrl.clone();
      privateDestination.pathname =
        privatePath + pathname.slice("/supreme".length);
      const redirectResponse = NextResponse.redirect(privateDestination, 307);
      redirectResponse.headers.set("Cache-Control", "private, no-store, max-age=0");
      redirectResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return redirectResponse;
    }
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isSupremePath =
    isCanonicalSupremePath || isPrivateSupremePath;
  if (isPrivateSupremePath) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  const isWorkforcePath =
    pathname === "/staff" || pathname.startsWith("/staff/") ||
    pathname === "/manager" || pathname.startsWith("/manager/") ||
    pathname === "/employee" || pathname.startsWith("/employee/");
  const isApiPath = pathname.startsWith("/api/");
  const isCustomerApi =
    (pathname.startsWith("/api/account/") &&
      pathname !== "/api/account/phone/send-otp" &&
      pathname !== "/api/account/phone/status" &&
      pathname !== "/api/account/phone/verify-otp" &&
      pathname !== "/api/account/security/register-device" &&
      pathname !== "/api/account/profile") ||
    pathname === "/api/eixpay" ||
    (pathname.startsWith("/api/eixpay/") && pathname !== "/api/eixpay/referral/apply");
  const isCustomerPage =
    pathname === "/account" || pathname.startsWith("/account/") ||
    pathname === "/orders" || pathname.startsWith("/orders/") ||
    pathname === "/wishlist" || pathname.startsWith("/wishlist/") ||
    pathname === "/eixverse" || pathname.startsWith("/eixverse/");
  const isCustomerProtected = isCustomerPage || isCustomerApi;
  const isCustomerLoginPath = pathname === "/auth/customer-login";
  const isSupremeMfaPath = pathname === "/auth/mfa" || pathname === "/auth/mfa/setup";

  // Refresh a present session before every API handler as well as protected
  // pages. API handlers may create their own server client; passing the
  // refreshed request cookies prevents those handlers from trying to rotate
  // the same stale refresh token again. Public APIs remain publicly accessible.
  // Public storefront pages avoid an auth lookup unless they need route gating.
  if (!isAdminPath && !isSupremePath && !isWorkforcePath && !isCustomerProtected && !isCustomerLoginPath && !isSupremeMfaPath && !isApiPath) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return new NextResponse("Supabase configuration missing.", { status: 500 });
  }

  const supabase = createServerClient(url, anonKey, {
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
      setAll(cookiesToSet, cacheHeaders) {
        // Make refreshed cookies visible to downstream Server Components in
        // this request, and persist the same values in the browser response.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        // Supabase SSR >=0.10 supplies the cache headers required whenever
        // refreshed auth cookies are written. Prevent Cloudflare/CDN caching.
        for (const [name, value] of Object.entries(cacheHeaders)) {
          response.headers.set(name, value);
        }
        response.headers.set(
          "Cache-Control",
          "private, no-cache, no-store, must-revalidate, max-age=0",
        );
        response.headers.set("Expires", "0");
        response.headers.set("Pragma", "no-cache");
      },
    },
  });

  // Validate signed claims and allow Supabase SSR to refresh expired sessions.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  // Refreshing auth cookies can replace the response object; reapply the
  // private-route indexing policy after claim validation.
  if (isPrivateSupremePath) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  const hasAuthenticatedSession = typeof userId === "string" && userId.length > 0;
  if (!isApiPath || isCustomerProtected || hasAuthenticatedSession || response.cookies.getAll().length > 0) {
    response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  }

  // Preserve Supabase's refreshed auth cookies and cache headers on
  // redirects returned after session validation.
  function copySessionState(target: NextResponse) {
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
    for (const name of ["Cache-Control", "Expires", "Pragma", "X-Robots-Tag"]) {
      const value = response.headers.get(name);
      if (value) target.headers.set(name, value);
    }
    target.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    target.headers.set("Expires", "0");
    target.headers.set("Pragma", "no-cache");
    return target;
  }

  // A valid customer session should never be shown the customer sign-in form.
  // Replace the login history entry with the storefront so Back cannot reopen
  // a stale login screen after a successful sign-in.
  if (isCustomerLoginPath && !claimsError && typeof userId === "string" && userId) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    destination.search = "";
    const redirectResponse = NextResponse.redirect(destination);
    return copySessionState(redirectResponse);
  }

  // MFA pages must not become an alternate browser entry for Supreme. The
  // dedicated Supreme app flow will be enabled only after server-verified
  // Android attestation is integrated; until then deny Supreme MFA here too.
  if (isSupremeMfaPath) {
    if (claimsError || typeof userId !== "string" || !userId) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/auth/supreme-login";
      destination.search = "";
      const redirectResponse = NextResponse.redirect(destination);
      return copySessionState(redirectResponse);
    }
    const { data: mfaProfile, error: mfaProfileError } = await supabase
      .from("staff_profiles")
      .select("role, is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (mfaProfileError) {
      return copySessionState(new NextResponse("MFA authorization unavailable.", {
        status: 503,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }));
    }
    if (mfaProfile?.role === "supreme") {
      return copySessionState(new NextResponse(
        "Supreme MFA is locked until verified Android app attestation is available.",
        { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" } },
      ));
    }
    return response;
  }

  // The remaining public routes do not need authorization checks.
  if (!isAdminPath && !isSupremePath && !isCustomerProtected) {
    return response;
  }

  // Require verified customer phone numbers before protected account features are accessible.
  if (isCustomerProtected) {
    if (claimsError || typeof userId !== "string" || !userId) {
      if (isCustomerApi) {
        return copySessionState(NextResponse.json(
          { error: "Authentication required.", code: "AUTHENTICATION_REQUIRED" },
          { status: 401, headers: { "Cache-Control": "private, no-store, max-age=0" } }
        ));
      }

      const destination = request.nextUrl.clone();
      destination.pathname = "/auth/customer-login";
      destination.search = "";
      destination.searchParams.set("next", pathname + request.nextUrl.search);
      const redirectResponse = NextResponse.redirect(destination);
      return copySessionState(redirectResponse);
    }

    const { data: customerProfile, error: customerProfileError } = await supabase
      .from("customer_profiles")
      .select("phone, phone_verified_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (customerProfileError || !customerProfile?.phone_verified_at || !customerProfile.phone) {
      // The account root is the phone-verification screen; keep it reachable
      // for authenticated customers who have not completed OTP verification.
      if (pathname === "/account") return response;
      if (isCustomerApi) {
        return NextResponse.json(
          { error: "ফোন নম্বর OTP দিয়ে যাচাই করার পর এই সুবিধা ব্যবহার করতে পারবেন।", code: "PHONE_VERIFICATION_REQUIRED" },
          { status: 403, headers: { "Cache-Control": "private, no-store" } }
        );
      }
      const destination = request.nextUrl.clone();
      destination.pathname = "/account";
      destination.search = "";
      destination.searchParams.set("verifyPhone", "1");
      const redirectResponse = NextResponse.redirect(destination);
      return copySessionState(redirectResponse);
    }
  }

  // Public pages and guest checkout never require a customer or staff login.
  if (!isAdminPath && !isSupremePath) return response;

  function redirectWithCookies(path: string) {
    const destination = request.nextUrl.clone();
    destination.pathname = path;
    destination.search = "";
    if (isPrivateSupremePath && (path === "/auth/mfa" || path === "/auth/mfa/setup")) {
      destination.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    }
    const redirectResponse = NextResponse.redirect(destination);
    return copySessionState(redirectResponse);
  }

  if (claimsError || typeof userId !== "string" || !userId) {
    const destination = request.nextUrl.clone();
    destination.pathname = isPrivateSupremePath ? "/auth/supreme-login" : "/auth/login";
    destination.search = "";
    destination.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    const redirectResponse = NextResponse.redirect(destination);
    return copySessionState(redirectResponse);
  }

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.is_active !== true ||
    !["supreme", "admin", "staff"].includes(profile.role)
  ) {
    return redirectWithCookies("/unauthorized");
  }

  if (isSupremePath) {
    if (profile.role !== "supreme") return redirectWithCookies("/unauthorized");

    // Fail closed until the complete Google Android Key Attestation verifier,
    // revocation checks, replay protection and server-side app proof are wired
    // into this request path. A private URL or WebView header is not app proof.
    return copySessionState(new NextResponse(
      "Supreme sign-in is temporarily locked while verified Android device attestation is completed.",
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" } },
    ));

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      return copySessionState(new NextResponse("MFA verification unavailable.", {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      }));
    }

    const verifiedFactor = factors.totp.find((factor) => factor.status === "verified");
    if (!verifiedFactor) return redirectWithCookies("/auth/mfa/setup");

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) {
      return copySessionState(new NextResponse("MFA verification unavailable.", {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      }));
    }
    if (assurance.currentLevel !== "aal2") return redirectWithCookies("/auth/mfa");
  }

  if (isPrivateSupremePath && hasValidPrivateSupremePath) {
    const privatePath = configuredSupremePath!;
    const destination = request.nextUrl.clone();
    destination.pathname =
      "/supreme" + pathname.slice(privatePath.length);
    const rewriteResponse = NextResponse.rewrite(destination);
    rewriteResponse.headers.set("Cache-Control", "private, no-store, max-age=0");
    rewriteResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.cookies.getAll().forEach((cookie) => rewriteResponse.cookies.set(cookie));
    return rewriteResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
