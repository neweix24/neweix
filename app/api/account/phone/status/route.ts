import { NextResponse } from "next/server";
import {
  createAdminSupabaseClient,
  getAuthenticatedCustomer,
  maskBangladeshPhone,
} from "@/lib/phone-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedCustomer();
  if (!user) {
    return NextResponse.json({ error: "লগইন প্রয়োজন।" }, { status: 401 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("customer_profiles")
      .select("phone, phone_verified_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const verified =
      Boolean(data?.phone_verified_at) &&
      typeof data?.phone === "string" &&
      data.phone.startsWith("+8801");

    return NextResponse.json({
      success: true,
      verified,
      phone: verified ? data.phone : null,
      maskedPhone: verified ? maskBangladeshPhone(data.phone) : null,
      verifiedAt: verified ? data.phone_verified_at : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      "Phone verification status failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json(
      { error: "ফোন যাচাইয়ের অবস্থা লোড করা যায়নি।" },
      { status: 503 }
    );
  }
}
