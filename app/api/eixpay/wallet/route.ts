import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "লগইন প্রয়োজন।" }, { status: 401, headers });
    const [walletResult, activityResult] = await Promise.all([
      supabase.rpc("eixpay_get_wallet"),
      supabase.rpc("eixpay_list_activity", { p_limit: 12, p_before_id: null }),
    ]);
    if (walletResult.error || activityResult.error) {
      console.error("EixPay wallet read failed:", { walletCode: walletResult.error?.code, activityCode: activityResult.error?.code });
      return NextResponse.json({ error: "EixPay ডেটা এখনো প্রস্তুত নয় অথবা লোড করা যায়নি।" }, { status: 503, headers });
    }
    return NextResponse.json({ success: true, wallet: walletResult.data, activity: activityResult.data ?? [] }, { headers });
  } catch (error) {
    console.error("EixPay wallet GET failed:", error);
    return NextResponse.json({ error: "EixPay ওয়ালেট লোড করা যায়নি।" }, { status: 503, headers });
  }
}
