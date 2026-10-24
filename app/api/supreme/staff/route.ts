import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "staff"] as const;
const MAX_BODY_BYTES = 4096;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function POST(request: Request) {
  try {
    // 1. Verify the logged-in user.
    const sessionClient = await createServerSupabaseClient();

    const {
      data: { user },
      error: userError,
    } = await sessionClient.auth.getUser();

    if (userError || !user) {
      return errorResponse("লগইন আবশ্যক।", 401);
    }

    // 2. Only an active Supreme user may create accounts.
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

    // 3. Require MFA assurance level AAL2.
    const { data: assurance, error: assuranceError } =
      await sessionClient.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      assuranceError ||
      assurance.currentLevel !== "aal2"
    ) {
      return errorResponse("MFA যাচাই সম্পন্ন করুন।", 403);
    }

    // 4. Check the declared request size.
    const contentLengthHeader =
      request.headers.get("content-length");

    if (contentLengthHeader !== null) {
      if (!/^\d+$/.test(contentLengthHeader)) {
        return errorResponse("সঠিক অনুরোধ পাঠান।", 400);
      }

      if (Number(contentLengthHeader) > MAX_BODY_BYTES) {
        return errorResponse("অনুরোধটি অনেক বড়।", 413);
      }
    }

    // 5. Read and enforce the actual request body size.
    let rawBody: string;

    try {
      rawBody = await request.text();
    } catch {
      return errorResponse("অনুরোধ পড়া যায়নি।", 400);
    }

    if (
      new TextEncoder().encode(rawBody).byteLength >
      MAX_BODY_BYTES
    ) {
      return errorResponse("অনুরোধটি অনেক বড়।", 413);
    }

    // 6. Parse JSON safely.
    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse("সঠিক JSON তথ্য দিন।", 400);
    }

    if (!isRecord(body)) {
      return errorResponse("সঠিক তথ্য দিন।", 400);
    }

    // 7. Validate email, password and role.
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    const role = body.role;

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

    // 8. Read the server-only service role secret.
    const { env } = await getCloudflareContext();

    const secret = (
      env as typeof env & {
        SUPABASE_SERVICE_ROLE_KEY?: string;
      }
    ).SUPABASE_SERVICE_ROLE_KEY;

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!secret || !supabaseUrl) {
      return errorResponse(
        "সার্ভার কনফিগারেশন অসম্পূর্ণ।",
        500
      );
    }

    const adminClient = createClient(
      supabaseUrl,
      secret,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 9. Create the Auth user.
    // Email confirmation remains required.
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

    // 10. Create the staff profile.
    const { error: insertError } = await adminClient
      .from("staff_profiles")
      .insert({
        user_id: created.user.id,
        role,
        is_active: true,
      });

    // 11. Roll back the Auth user if profile creation fails.
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

    // 12. Return only non-secret account details.
    return NextResponse.json(
      {
        success: true,
        message:
          "অ্যাকাউন্ট তৈরি হয়েছে। লগইনের আগে ইমেইল নিশ্চিতকরণ প্রয়োজন হতে পারে।",
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