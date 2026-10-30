import { NextResponse } from "next/server";
import {
  createAdminSupabaseClient,
  getAuthenticatedCustomer,
  hashPhoneOtp,
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

  const values = body as Record<string, unknown>;
  const challengeId = values.challengeId;
  const otp = values.otp;

  if (
    typeof challengeId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(challengeId) ||
    typeof otp !== "string" ||
    !/^\d{6}$/.test(otp)
  ) {
    return fail("৬ সংখ্যার OTP এবং সঠিক অনুরোধ দিন।", 400);
  }

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    return fail("সার্ভার কনফিগারেশন অসম্পূর্ণ।", 503);
  }

  const { data: challenge, error: challengeError } = await supabase
    .from("phone_verification_challenges")
    .select("phone")
    .eq("id", challengeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (challengeError) return fail("OTP যাচাই করা যাচ্ছে না।", 503);
  if (!challenge?.phone) return fail("OTP অনুরোধটি পাওয়া যায়নি। নতুন OTP নিন।", 400);

  let otpHash: string;
  try {
    otpHash = await hashPhoneOtp(challengeId, user.id, challenge.phone, otp);
  } catch {
    return fail("OTP নিরাপত্তা কনফিগারেশন পাওয়া যায়নি।", 503);
  }

  const { data: result, error } = await supabase.rpc(
    "consume_phone_verification_challenge",
    {
      p_user_id: user.id,
      p_challenge_id: challengeId,
      p_phone: challenge.phone,
      p_otp_hash: otpHash,
    }
  );

  if (error) {
    console.error("Phone verification database operation failed:", error.message);
    return fail("OTP যাচাই করা যায়নি। পরে আবার চেষ্টা করুন।", 503);
  }

  switch (result) {
    case "verified":
      return NextResponse.json({
        success: true,
        phone: challenge.phone,
        message: "আপনার ফোন নম্বর সফলভাবে যাচাই হয়েছে।",
      });
    case "invalid_otp":
      return fail("OTP সঠিক নয়। আবার চেষ্টা করুন।", 400);
    case "expired":
      return fail("OTP-এর মেয়াদ শেষ। নতুন OTP নিন।", 410);
    case "too_many_attempts":
      return fail("অনেকবার ভুল OTP দেওয়া হয়েছে। নতুন OTP নিন।", 429);
    case "phone_in_use":
      return fail("এই নম্বরটি অন্য একটি যাচাইকৃত অ্যাকাউন্টে যুক্ত আছে।", 409);
    case "already_used":
      return fail("এই OTP আগে ব্যবহার করা হয়েছে। নতুন OTP নিন।", 409);
    default:
      return fail("OTP অনুরোধটি বৈধ নয়। নতুন OTP নিন।", 400);
  }
}
