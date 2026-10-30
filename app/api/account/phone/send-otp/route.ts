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
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedCustomer();
  if (!user) return fail("ফোন নম্বর যাচাই করতে আগে লগইন করুন।", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("সঠিক তথ্য পাঠান।", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("সঠিক তথ্য পাঠান।", 400);
  }

  const input = (body as Record<string, unknown>).phone;
  if (typeof input !== "string") return fail("মোবাইল নম্বর দিন।", 400);

  const phone = normalizeBangladeshPhone(input);
  if (!phone) {
    return fail("সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)।", 400);
  }

  const apiKey = getServerSetting("BULKSMSBD_API_KEY");
  const senderId = getServerSetting("BULKSMSBD_SENDER_ID");
  if (!apiKey || !senderId) {
    return fail("SMS পরিষেবা এখনো কনফিগার করা হয়নি। পরে আবার চেষ্টা করুন।", 503);
  }

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    return fail("সার্ভার কনফিগারেশন অসম্পূর্ণ।", 503);
  }

  const { data: profile, error: profileError } = await supabase
    .from("customer_profiles")
    .select("phone, phone_verified_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) return fail("অ্যাকাউন্ট যাচাই করা যাচ্ছে না।", 503);

  if (
    profile?.phone_verified_at &&
    profile.phone === phone
  ) {
    return NextResponse.json({
      success: true,
      alreadyVerified: true,
      message: "এই নম্বরটি ইতিমধ্যে যাচাই করা আছে।",
    });
  }

  const { data: phoneOwner, error: ownerError } = await supabase
    .from("customer_profiles")
    .select("user_id")
    .eq("phone", phone)
    .not("phone_verified_at", "is", null)
    .neq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (ownerError) return fail("নম্বর যাচাই করা যাচ্ছে না।", 503);
  if (phoneOwner) {
    return fail("এই নম্বরটি অন্য একটি যাচাইকৃত অ্যাকাউন্টে যুক্ত আছে।", 409);
  }

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [userRecent, phoneRecent] = await Promise.all([
    supabase
      .from("phone_verification_challenges")
      .select("id, created_at, sent_at")
      .eq("user_id", user.id)
      .gte("created_at", dayAgo),
    supabase
      .from("phone_verification_challenges")
      .select("id, created_at, sent_at")
      .eq("phone", phone)
      .gte("created_at", dayAgo),
  ]);

  if (userRecent.error || phoneRecent.error) {
    return fail("OTP পরিষেবা সাময়িকভাবে ব্যস্ত।", 503);
  }

  const sentByUser = (userRecent.data ?? []).filter((row) => row.sent_at);
  const sentToPhone = (phoneRecent.data ?? []).filter((row) => row.sent_at);

  if (sentByUser.length >= 5 || sentToPhone.length >= 10) {
    return fail("OTP পাঠানোর দৈনিক সীমা শেষ। ২৪ ঘণ্টা পরে আবার চেষ্টা করুন।", 429);
  }

  const latestSentAt = sentToPhone
    .map((row) => Date.parse(row.sent_at as string))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  if (latestSentAt && now - latestSentAt < 60_000) {
    return fail("নতুন OTP পাঠানোর আগে ৬০ সেকেন্ড অপেক্ষা করুন।", 429);
  }

  // Keep the challenge table small; expired historical records are not needed.
  await supabase
    .from("phone_verification_challenges")
    .delete()
    .lt("created_at", new Date(now - 48 * 60 * 60 * 1000).toISOString());

  const challengeId = crypto.randomUUID();
  const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000)
    .padStart(6, "0");
  const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();

  let otpHash: string;
  try {
    otpHash = await hashPhoneOtp(challengeId, user.id, phone, otp);
  } catch {
    return fail("OTP নিরাপত্তা কনফিগারেশন পাওয়া যায়নি।", 503);
  }

  const { error: insertError } = await supabase
    .from("phone_verification_challenges")
    .insert({
      id: challengeId,
      user_id: user.id,
      phone,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });

  if (insertError) {
    return fail("OTP অনুরোধ তৈরি করা যায়নি।", 503);
  }

  const form = new FormData();
  form.set("api_key", apiKey);
  form.set("type", "text");
  form.set("number", phone.slice(1));
  form.set("senderid", senderId);
  form.set(
    "message",
    `NEWEIX verification code: ${otp}. Valid for 5 minutes. Do not share this code.`
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
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidate =
        parsed.response_code ?? parsed.code ?? parsed.status;
      if (typeof candidate === "number" || typeof candidate === "string") {
        responseCode = Number(candidate);
      }
    } catch {
      const match = raw.match(/^\s*(\d{3,4})\b/);
      if (match) responseCode = Number(match[1]);
    }

    if (!response.ok || (response.status !== 202 && responseCode !== 202)) {
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
          ? "SMS provider-এর Source IP অনুমোদিত নয়। BulkSMSBD সেটিংস যাচাই করুন।"
          : "SMS পাঠানো যায়নি। Sender ID, API Key ও SMS balance যাচাই করুন।",
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
      return fail("SMS পাঠানো হয়েছে, তবে OTP সেশন সংরক্ষণ হয়নি। নতুন করে চেষ্টা করুন।", 503);
    }

    return NextResponse.json({
      success: true,
      challengeId,
      expiresIn: 300,
      resendAfter: 60,
      message: "আপনার নম্বরে OTP পাঠানো হয়েছে।",
    });
  } catch (error) {
    await supabase
      .from("phone_verification_challenges")
      .delete()
      .eq("id", challengeId);
    console.error(
      "BulkSMSBD request failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return fail("SMS পরিষেবার সঙ্গে সংযোগ করা যায়নি। পরে আবার চেষ্টা করুন।", 502);
  }
}
