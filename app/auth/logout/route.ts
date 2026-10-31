import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Supabase configuration missing." },
      { status: 500 }
    );
  }

  const response = NextResponse.redirect(
    new URL("/auth/login", request.url),
    { status: 303 }
  );

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      path: "/",
      domain: process.env.NODE_ENV === "production" ? ".neweix.com" : undefined,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
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

  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.json(
      { error: "লগআউট করা যায়নি। আবার চেষ্টা করুন।" },
      { status: 500 }
    );
  }

  return response;
}