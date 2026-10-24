import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "staff"] as const;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const sessionClient = await createServerSupabaseClient();

    const {
      data: { user },
      error: userError,
    } = await sessionClient.auth.getUser();

    if (userError || !user) {
      return errorResponse("লগইন আবশ্যক।", 401);
    }

    const { data: profile, error: profileError } =
      await sessionClient
        .from("staff_profiles")
        .select("role, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.role !== "supreme" ||
      profile.is_active !== true
    ) {
      return errorResponse("অনুমতি নেই।", 403);
    }

    const { data: assurance, error: assuranceError } =
      await sessionClient.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      assuranceError ||
      assurance.currentLevel !== "aal2"
    ) {
      return errorResponse("MFA যাচাই সম্পন্ন করুন।", 403);
    }

    const contentLength = Number(
      request.headers.get("content-length") || "0"
    );

    if (contentLength > 4096) {
      return errorResponse("অনুরোধটি অনেক বড়।", 413);
    }

    const body: unknown = await request.json().catch(() => null);

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return errorResponse("সঠিক তথ্য দিন।", 400);
    }

    const input = body as Record<string, unknown>;

    const email =
      typeof input.email === "string"
        ? input.email.trim().toLowerCase()
        : "";

    const password =
      typeof input.password === "string"
        ? input.password
        : "";

    const role = input.role;

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return errorResponse("সঠিক ইমেইল দিন।", 400);
    }

    if (password.length < 12 || password.length > 128) {
      return errorResponse(
        "পাসওয়ার্ড ১২ থেকে ১২৮ অক্ষরের হতে হবে।",
        400
      );
    }

    if (
      typeof role !== "string" ||
      !ALLOWED_ROLES.includes(
        role as (typeof ALLOWED_ROLES)[number]
      )
    ) {
      return errorResponse(
        "Role admin অথবা staff হতে হবে।",
        400
      );
    }

    const { env } = await getCloudflareContext();

    const secret = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!secret || !supabaseUrl) {
      return errorResponse(
        "সার্ভার কনফিগারেশন অসম্পূর্ণ।",
        500
      );
    }

    const adminClient = createClient(supabaseUrl, secret, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
      });

    if (createError || !created.user) {
      return errorResponse(
        "অ্যাকাউন্ট তৈরি হয়নি। ইমেইল আগে থেকেই আছে কি না যাচাই করুন।",
        400
      );
    }

    const { error: insertError } = await adminClient
      .from("staff_profiles")
      .insert({
        user_id: created.user.id,
        role,
        is_active: true,
      });

    if (insertError) {
      const { error: deleteError } =
        await adminClient.auth.admin.deleteUser(
          created.user.id
        );

      if (deleteError) {
        return errorResponse(
          "Profile তৈরি হয়নি। Supabase Auth-এ নতুন user-এর অবস্থা যাচাই করুন।",
          500
        );
      }

      return errorResponse(
        "Staff profile তৈরি হয়নি; নতুন account বাতিল করা হয়েছে।",
        500
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "অ্যাকাউন্ট তৈরি হয়েছে।",
        user: {
          id: created.user.id,
          email: created.user.email,
          role,
        },
      },
      { status: 201 }
    );
  } catch {
    return errorResponse("সার্ভারে সমস্যা হয়েছে।", 500);
  }
}