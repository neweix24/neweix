import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return new NextResponse("Supabase configuration missing.", {
      status: 500,
    });
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  function redirectWithCookies(path: string) {
    const destination = request.nextUrl.clone();
    destination.pathname = path;
    destination.search = "";

    const redirectResponse = NextResponse.redirect(destination);

    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    return redirectResponse;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/auth/login";
    destination.search = "";
    destination.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search
    );

    const redirectResponse = NextResponse.redirect(destination);

    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    return redirectResponse;
  }

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.is_active !== true ||
    !["supreme", "admin", "staff"].includes(profile.role)
  ) {
    return redirectWithCookies("/unauthorized");
  }

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/supreme")) {
    if (profile.role !== "supreme") {
      return redirectWithCookies("/unauthorized");
    }

    const { data: factors, error: factorsError } =
      await supabase.auth.mfa.listFactors();

    if (factorsError) {
      return new NextResponse("MFA verification unavailable.", {
        status: 503,
      });
    }

    const verifiedFactor = factors.totp.find(
      (factor) => factor.status === "verified"
    );

    if (!verifiedFactor) {
      return redirectWithCookies("/auth/mfa/setup");
    }

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (assuranceError) {
      return new NextResponse("MFA verification unavailable.", {
        status: 503,
      });
    }

    if (assurance.currentLevel !== "aal2") {
      return redirectWithCookies("/auth/mfa");
    }
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/supreme/:path*"],
};