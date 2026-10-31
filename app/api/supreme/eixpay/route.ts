import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function fail(message: string, status: number) { return NextResponse.json({ error: message }, { status, headers }); }
async function getSupreme() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, response: fail("লগইন প্রয়োজন।", 401) };
  const { data: profile, error: profileError } = await supabase.from("staff_profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || profile.is_active !== true || profile.role !== "supreme") {
    return { ok: false as const, response: fail("শুধু সক্রিয় Supreme অ্যাকাউন্ট এই কাজ করতে পারবে।", 403) };
  }
  const { data: assurance, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") return { ok: false as const, response: fail("Supreme MFA যাচাই সম্পন্ন করুন।", 403) };
  return { ok: true as const, supabase };
}
export async function GET() {
  try {
    const access = await getSupreme();
    if (!access.ok) return access.response;
    const { data, error } = await access.supabase.rpc("eixpay_supreme_get_dashboard");
    if (error) {
      console.error("EixPay Supreme dashboard failed:", error.code);
      return fail("EixPay control data লোড করা যায়নি।", 503);
    }
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error) {
    console.error("EixPay Supreme GET failed:", error);
    return fail("EixPay control data লোড করা যায়নি।", 500);
  }
}
export async function PATCH(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return fail("অনুরোধটি অনেক বড়।", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("সঠিক JSON অনুরোধ দিন।", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("সঠিক অনুরোধ পাঠান।", 400);
    const input = body as Record<string, unknown>;
    const access = await getSupreme();
    if (!access.ok) return access.response;

    if (input.action === "program") {
      const values = [input.walletEnabled, input.earningEnabled, input.redemptionEnabled, input.transferEnabled];
      if (!values.every((value) => typeof value === "boolean")) return fail("প্রোগ্রামের সব switch boolean হতে হবে।", 400);
      const { data, error } = await access.supabase.rpc("eixpay_set_program_config", {
        p_wallet_enabled: input.walletEnabled,
        p_earning_enabled: input.earningEnabled,
        p_redemption_enabled: input.redemptionEnabled,
        p_transfer_enabled: input.transferEnabled,
      });
      if (error) return fail(error.code === "42501" ? "Supreme MFA অনুমোদন প্রয়োজন।" : "প্রোগ্রাম সেটিং সংরক্ষণ করা যায়নি।", error.code === "42501" ? 403 : 400);
      return NextResponse.json({ success: true, data }, { headers });
    }

    if (input.action === "transfer_limits") {
      const values = [input.minAmount, input.maxAmount, input.dailyMaxAmount, input.maxRequestsPerDay];
      if (!values.every((value) => typeof value === "number" && Number.isSafeInteger(value))
        || (input.minAmount as number) < 1
        || (input.maxAmount as number) < (input.minAmount as number)
        || (input.dailyMaxAmount as number) < (input.maxAmount as number)
        || (input.maxRequestsPerDay as number) < 1 || (input.maxRequestsPerDay as number) > 50) {
        return fail("ট্রান্সফার সীমার তথ্য সঠিক নয়।", 400);
      }
      const { data, error } = await access.supabase.rpc("eixpay_set_transfer_limits", {
        p_min_amount: input.minAmount,
        p_max_amount: input.maxAmount,
        p_daily_max_amount: input.dailyMaxAmount,
        p_max_requests_per_day: input.maxRequestsPerDay,
      });
      if (error) return fail(error.code === "42501" ? "Supreme MFA অনুমোদন প্রয়োজন।" : "ট্রান্সফার সীমা সংরক্ষণ করা যায়নি।", error.code === "42501" ? 403 : 400);
      return NextResponse.json({ success: true, data }, { headers });
    }

    if (input.action === "reward_rule") {
      if (typeof input.eventCode !== "string" || !/^[a-z_]{3,60}$/.test(input.eventCode)
        || typeof input.enabled !== "boolean"
        || typeof input.rewardAmount !== "number" || !Number.isSafeInteger(input.rewardAmount) || input.rewardAmount < 0
        || typeof input.maxPerDay !== "number" || !Number.isSafeInteger(input.maxPerDay) || input.maxPerDay < 0 || input.maxPerDay > 1000) {
        return fail("রিওয়ার্ড নিয়মের তথ্য সঠিক নয়।", 400);
      }
      const { data, error } = await access.supabase.rpc("eixpay_set_reward_rule", {
        p_event_code: input.eventCode,
        p_enabled: input.enabled,
        p_reward_amount: input.rewardAmount,
        p_max_per_user_per_day: input.maxPerDay,
      });
      if (error) return fail(error.code === "42501" ? "Supreme MFA অনুমোদন প্রয়োজন।" : "রিওয়ার্ড নিয়ম সংরক্ষণ করা যায়নি।", error.code === "42501" ? 403 : 400);
      return NextResponse.json({ success: true, data }, { headers });
    }
    return fail("অজানা EixPay কন্ট্রোল অ্যাকশন।", 400);
  } catch (error) {
    console.error("EixPay Supreme PATCH failed:", error);
    return fail("EixPay সেটিং সংরক্ষণ করা যায়নি।", 500);
  }
}
