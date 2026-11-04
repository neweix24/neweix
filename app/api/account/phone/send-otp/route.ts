import { NextResponse } from "next/server";
import {
  createAdminSupabaseClient,
  getAuthenticatedCustomer,
  getServerSetting,
  hashPhoneOtp,
  normalizeBangladeshPhone,
} from "@/lib/phone-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store, private, max-age=0" },
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedCustomer();
  if (!user) return fail("Sign in before verifying your phone number.", 401);

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 4096) {
    return fail("The request payload is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return fail("Submit valid information.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("Submit valid information.", 400);
  }

  const input = (body as Record<string, unknown>).phone;
  if (typeof input !== "string") return fail("Enter a mobile number.", 400);

  const phone = normalizeBangladeshPhone(input);
  if (!phone) {
    return fail("Enter a valid Bangladesh mobile number (01XXXXXXXXX).", 400);
  }

  const apiKey = getServerSetting("BULKSMSBD_API_KEY");
  const senderId = getServerSetting("BULKSMSBD_SENDER_ID");
  if (!apiKey || !senderId) {
    return fail("The SMS service is not configured yet. Please try again later.", 503);
  }

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    return fail("Server configuration is incomplete.", 503);
  }

  const { data: profile, error: profileError } = await supabase
    .from("customer_profiles")
    .select("phone, phone_verified_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) return fail("Unable to verify the account.", 503);

  if (
    profile?.phone_verified_at &&
    profile.phone === phone
  ) {
    return NextResponse.json({
      success: true,
      alreadyVerified: true,
      message: "This phone number is already verified.",
    }, { headers: { "Cache-Control": "no-store, private, max-age=0" } });
  }

  const { data: phoneOwner, error: ownerError } = await supabase
    .from("customer_profiles")
    .select("user_id")
    .eq("phone", phone)
    .not("phone_verified_at", "is", null)
    .neq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (ownerError) return fail("Unable to verify the phone number.", 503);
  if (phoneOwner) {
    return fail("This number is already linked to another verified account.", 409);
  }

  const now = Date.now();

  // Keep the challenge table small; expired historical records are not needed.
  await supabase
    .from("phone_verification_challenges")
    .delete()
    .lt("created_at", new Date(now - 48 * 60 * 60 * 1000).toISOString());

  const challengeId = crypto.randomUUID();
  const randomLimit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const randomBuffer = new Uint32Array(1);
  let randomValue = 0;
  do {
    crypto.getRandomValues(randomBuffer);
    randomValue = randomBuffer[0];
  } while (randomValue >= randomLimit);
  const otp = String(randomValue % 1_000_000).padStart(6, "0");
  const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();

  let otpHash: string;
  try {
    otpHash = await hashPhoneOtp(challengeId, user.id, phone, otp);
  } catch {
    return fail("OTP security configuration was not found.", 503);
  }

  const { data: reservation, error: reserveError } = await supabase.rpc(
    "reserve_phone_verification_challenge",
    {
      p_challenge_id: challengeId,
      p_user_id: user.id,
      p_phone: phone,
      p_otp_hash: otpHash,
      p_expires_at: expiresAt,
    }
  );

  if (reserveError) {
    console.error("Atomic OTP reservation failed:", reserveError.message);
    return fail("The OTP service is temporarily busy.", 503);
  }

  switch (reservation) {
    case "reserved":
      break;
    case "cooldown":
      return fail("Wait 60 seconds before requesting another OTP.", 429);
    case "user_daily_limit":
    case "phone_daily_limit":
      return fail("The daily OTP limit has been reached. Please try again in 24 hours.", 429);
    default:
      return fail("The OTP request could not be accepted.", 400);
  }

  const form = new FormData();
  form.set("api_key", apiKey);
  form.set("type", "text");
  form.set("number", phone.slice(1));
  form.set("senderid", senderId);
  form.set(
    "message",
    `NEWEIX verification code: ${otp}. Use it within 5 minutes. Do not share it.`
  );

  try {
    const response = await fetch("https://bulksmsbd.net/api/smsapi", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
    const raw = (await response.text()).trim();
    let responseCode: number | null = null;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "number" || typeof parsed === "string") {
        const candidate = Number(parsed);
        if (Number.isFinite(candidate)) responseCode = candidate;
      } else if (parsed && typeof parsed === "object") {
        const value = parsed as Record<string, unknown>;
        const candidate = value.response_code ?? value.code ?? value.status;
        if (typeof candidate === "number" || typeof candidate === "string") {
          const numericCode = Number(candidate);
          if (Number.isFinite(numericCode)) responseCode = numericCode;
        }
      }
    } catch {
      // The provider commonly returns a plain numeric response code.
    }

    if (responseCode === null) {
      const match = raw.match(/^\s*(\d{3,4})\b/);
      if (match) responseCode = Number(match[1]);
    }

    if (
      !response.ok ||
      (responseCode !== 202 && !(response.status === 202 && responseCode === null))
    ) {
      await supabase
        .from("phone_verification_challenges")
        .delete()
        .eq("id", challengeId);
      console.error("BulkSMSBD rejected OTP submission:", {
        httpStatus: response.status,
        responseCode,
      });
      return fail(
        responseCode === 1032
          ? "The SMS provider did not authorize this source IP. Check your BulkSMSBD settings."
          : "Unable to send SMS. Check your Sender ID, API key, and SMS balance.",
        502
      );
    }

    const { error: sentUpdateError } = await supabase
      .from("phone_verification_challenges")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", challengeId);

    if (sentUpdateError) {
      await supabase
        .from("phone_verification_challenges")
        .delete()
        .eq("id", challengeId);
      return fail("The SMS was sent, but the OTP session could not be saved. Please try again.", 503);
    }

    return NextResponse.json({
      success: true,
      challengeId,
      expiresIn: 300,
      resendAfter: 60,
      message: "An OTP has been sent to your phone number.",
    }, { headers: { "Cache-Control": "no-store, private, max-age=0" } });
  } catch (error) {
    await supabase
      .from("phone_verification_challenges")
      .delete()
      .eq("id", challengeId);
    console.error(
      "BulkSMSBD request failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return fail("Unable to connect to the SMS service. Please try again later.", 502);
  }
}
