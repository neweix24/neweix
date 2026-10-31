import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "লগইন প্রয়োজন।" }, { status: 401, headers });
    const { data, error } = await supabase.rpc("neweix_plus_get_status");
    if (error) {
      console.error("Neweix+ status query failed:", error.code);
      return NextResponse.json({ error: "Neweix+ সদস্যপদের তথ্য লোড করা যায়নি।" }, { status: 503, headers });
    }
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error) {
    console.error("Neweix+ status GET failed:", error);
    return NextResponse.json({ error: "Neweix+ সদস্যপদের তথ্য লোড করা যায়নি।" }, { status: 503, headers });
  }
}
