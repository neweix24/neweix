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
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isSupremePath = pathname === "/supreme" || pathname.startsWith("/supreme/");
  const isCustomerApi =
    (pathname.startsWith("/api/account/") &&
      pathname !== "/api/account/phone/send-otp" &&
      pathname !== "/api/account/phone/status" &&
      pathname !== "/api/account/phone/verify-otp" &&
      pathname !== "/api/account/security/register-device") ||
    pathname === "/api/eixpay" || pathname.startsWith("/api/eixpay/") ||
    pathname === "/api/orders";
  const isCustomerPage =
    pathname.startsWith("/account/") ||
    pathname === "/orders" || pathname.startsWith("/orders/") ||
    pathname === "/wishlist" || pathname.startsWith("/wishlist/");
  const isCustomerProtected = isCustomerPage || isCustomerApi;

  // Do not refresh auth cookies on anonymous storefront navigation, assets,
  // or unrelated API requests. Each authenticated browser client maintains
  // its own session; refreshing on every public request creates avoidable
  // concurrent refresh-token rotations and stale-cookie races.
  if (!isAdminPath && !isSupremePath && !isCustomerProtected) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return new NextResponse("Supabase configuration missing.", { status: 500 });
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Validate the session only for protected customer and workspace routes.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  response.headers.set("Cache-Control", "private, no-store");

  // Require verified customer phone numbers before protected account features are accessible.
  if (isCustomerProtected) {
    if (claimsError || typeof userId !== "string" || !userId) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/auth/customer-login";
      destination.search = "";
      destination.searchParams.set("next", pathname + request.nextUrl.search);
      const redirectResponse = NextResponse.redirect(destination);
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      redirectResponse.headers.set("Cache-Control", "private, no-store");
      return redirectResponse;
    }

    const { data: customerProfile, error: customerProfileError } = await supabase
      .from("customer_profiles")
      .select("phone, phone_verified_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (customerProfileError || !customerProfile?.phone_verified_at || !customerProfile.phone) {
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
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      redirectResponse.headers.set("Cache-Control", "private, no-store");
      return redirectResponse;
    }
  }

  // Public pages and guest checkout never require a customer or staff login.
  if (!isAdminPath && !isSupremePath) return response;

  function redirectWithCookies(path: string) {
    const destination = request.nextUrl.clone();
    destination.pathname = path;
    destination.search = "";
    const redirectResponse = NextResponse.redirect(destination);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
  }

  if (claimsError || typeof userId !== "string" || !userId) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/auth/login";
    destination.search = "";
    destination.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    const redirectResponse = NextResponse.redirect(destination);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
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

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      return new NextResponse("MFA verification unavailable.", {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const verifiedFactor = factors.totp.find((factor) => factor.status === "verified");
    if (!verifiedFactor) return redirectWithCookies("/auth/mfa/setup");

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) {
      return new NextResponse("MFA verification unavailable.", {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (assurance.currentLevel !== "aal2") return redirectWithCookies("/auth/mfa");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
