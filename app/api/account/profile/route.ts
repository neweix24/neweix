import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/phone-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: responseHeaders });
}

export async function POST(request: Request) {
  try {
    // Verify the browser's cookie-backed session with the Auth server.
    const authClient = await createServerSupabaseClient();
    const { data: authData, error: authError } = await authClient.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      return fail("Sign in to access your customer profile.", 401);
    }

    let input: Record<string, unknown> = {};
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 8192) {
      return fail("Profile request payload is too large.", 413);
    }
    if (rawBody.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return fail("Submit valid profile information.", 400);
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return fail("Submit valid profile information.", 400);
      }
      input = parsed as Record<string, unknown>;
      const allowedFields = new Set(["full_name", "date_of_birth"]);
      if (Object.keys(input).some((key) => !allowedFields.has(key))) {
        return fail("Only your name and date of birth can be updated here.", 400);
      }
    }

    const isProfileUpdate =
      Object.prototype.hasOwnProperty.call(input, "full_name") ||
      Object.prototype.hasOwnProperty.call(input, "date_of_birth");

    if (isProfileUpdate) {
      const fullName = input.full_name;
      if (
        typeof fullName !== "string" ||
        fullName.trim().length < 2 ||
        fullName.trim().length > 100
      ) {
        return fail("Enter a name between 2 and 100 characters.", 400);
      }

      const dateOfBirth = input.date_of_birth;
      if (dateOfBirth !== null && dateOfBirth !== undefined) {
        if (
          typeof dateOfBirth !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ||
          Number.isNaN(Date.parse(dateOfBirth)) ||
          new Date(dateOfBirth).toISOString().slice(0, 10) !== dateOfBirth ||
          dateOfBirth < "1900-01-01" ||
          dateOfBirth > new Date().toISOString().slice(0, 10)
        ) {
          return fail("Enter a valid date of birth.", 400);
        }
      }
    }

    const admin = createAdminSupabaseClient();
    const { data: existing, error: readError } = await admin
      .from("customer_profiles")
      .select("full_name,date_of_birth,avatar_url,preferred_language,phone,phone_verified_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      console.error("Customer profile lookup failed:", readError.message);
      return fail("Your profile could not be loaded. Please try again.", 503);
    }

    // Keep phone verification server-controlled. This endpoint never accepts
    // phone, phone_verified_at, email, or user_id from the request body.
    if (isProfileUpdate && (!existing?.phone || !existing.phone_verified_at)) {
      return fail("Verify your mobile number by OTP before saving profile information.", 403);
    }

    const metadata = user.user_metadata ?? {};
    const metadataName =
      typeof metadata.full_name === "string" ? metadata.full_name :
      typeof metadata.name === "string" ? metadata.name : null;
    const rawAvatar =
      typeof metadata.picture === "string" ? metadata.picture :
      typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
    const metadataAvatar = rawAvatar?.startsWith("https://") ? rawAvatar : null;
    const rawLocale = typeof metadata.locale === "string" ? metadata.locale : null;
    const metadataLanguage =
      rawLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLocale) ? rawLocale : null;

    const fullName = isProfileUpdate
      ? (input.full_name as string).trim()
      : existing?.full_name ?? metadataName;
    const dateOfBirth = isProfileUpdate
      ? (input.date_of_birth as string | null | undefined) ?? null
      : existing?.date_of_birth ?? null;

    const { data: saved, error: saveError } = await admin
      .from("customer_profiles")
      .upsert({
        user_id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        date_of_birth: dateOfBirth,
        avatar_url: existing?.avatar_url ?? metadataAvatar,
        preferred_language: existing?.preferred_language ?? metadataLanguage,
      }, { onConflict: "user_id" })
      .select("full_name,date_of_birth,avatar_url,preferred_language")
      .single();

    if (saveError || !saved) {
      console.error("Customer profile synchronization failed:", saveError?.message ?? "No profile returned");
      return fail("Your profile could not be saved. Please try again.", 503);
    }

    return NextResponse.json({
      success: true,
      profile: saved,
    }, { headers: responseHeaders });
  } catch (error) {
    console.error(
      "Customer profile endpoint failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return fail("The profile service is temporarily unavailable.", 503);
  }
}
