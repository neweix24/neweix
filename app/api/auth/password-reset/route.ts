import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

function response() {
  // একই বার্তা রাখি, যাতে অ্যাকাউন্টের ধরন প্রকাশ না পায়।
  return NextResponse.json({
    message:
      "যদি এই ইমেইলে পাসওয়ার্ড লগইন চালু থাকে, তাহলে রিসেটের নির্দেশনা পাঠানো হবে।",
  });
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(
      request.headers.get("content-length") ?? "0"
    );

    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "অনুরোধটি অনেক বড়।" },
        { status: 413 }
      );
    }

    const rawBody = await request.text();

    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "অনুরোধটি অনেক বড়।" },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "অনুরোধটি সঠিক নয়।" },
        { status: 400 }
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("email" in body) ||
      typeof body.email !== "string" ||
      !("captchaToken" in body) ||
      typeof body.captchaToken !== "string" ||
      body.captchaToken.length < 10 ||
      body.captchaToken.length > 4096
    ) {
      return NextResponse.json(
        { error: "সঠিক ইমেইল দিন।" },
        { status: 400 }
      );
    }

    const email = body.email.trim().toLowerCase();
    const captchaToken = body.captchaToken;

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { error: "সঠিক ইমেইল দিন।" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Password reset API environment variables are missing.");
      return NextResponse.json(
        { error: "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।" },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: hasPassword, error: checkError } =
      await adminClient.rpc("neweix_has_password_account", {
        p_email: email,
      });

    if (checkError) {
      console.error("Password account check failed:", checkError.message);
      return NextResponse.json(
        { error: "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।" },
        { status: 500 }
      );
    }

    // OAuth-only অথবা পাসওয়ার্ডবিহীন অ্যাকাউন্টে ইমেইল পাঠাব না।
    if (hasPassword !== true) {
      return response();
    }

    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const siteUrl =
      process.env.NEWEIX_SITE_URL ?? "https://neweix.com";

    const { error: resetError } =
      await publicClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?next=%2Fauth%2Freset-password`,
        captchaToken,
      });

    if (resetError) {
      console.error("Password reset request failed:", resetError.message);
      // অ্যাকাউন্টের অস্তিত্ব বা ধরন প্রকাশ করব না।
    }

    return response();
  } catch (error) {
    console.error("Password reset API failed:", error);
    return NextResponse.json(
      { error: "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।" },
      { status: 500 }
    );
  }
}