import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const code = request.cookies.get("neweix_referral_code")?.value ?? "";
  const response = (payload: Record<string, unknown>, status = 200) =>
    NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });

  if (!code) return response({ success: true, applied: false, reason: "no_referral_cookie" });

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return response({ error: "লগইন প্রয়োজন।" }, 401);

    const { data, error } = await supabase.rpc("eixpay_apply_referral_code", { p_referral_code: code });
    const result = response(error
      ? { success: false, applied: false, reason: error.code === "22023" ? "invalid_or_self_referral" : "referral_not_applied" }
      : { success: true, applied: Boolean(data?.status === "pending"), duplicate: Boolean(data?.duplicate), reason: data?.reason ?? null });

    result.cookies.set("neweix_referral_code", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    if (error) console.warn("EixPay referral attribution was not applied:", error.code);
    return result;
  } catch (error) {
    console.error("EixPay referral attribution failed:", error);
    return response({ success: false, applied: false, error: "রেফারেল কোড প্রয়োগ করা যায়নি।" }, 500);
  }
}
