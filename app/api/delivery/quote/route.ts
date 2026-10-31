import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = (searchParams.get("city") || "").trim();
  const subtotal = Number(searchParams.get("subtotal") || 0);

  if (city.length < 2 || city.length > 120 || !Number.isSafeInteger(subtotal) || subtotal < 0) {
    return NextResponse.json({ error: "সঠিক শহর/জেলা ও পণ্যের মূল্য দিন।" }, { status: 400 });
  }

  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, unknown>;
    const url = typeof runtimeEnv.NEXT_PUBLIC_SUPABASE_URL === "string"
      ? runtimeEnv.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = typeof runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === "string"
      ? runtimeEnv.SUPABASE_SERVICE_ROLE_KEY
      : process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) throw new Error("Supabase configuration missing.");

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("shop_settings")
      .select("key,value")
      .in("key", ["delivery_fee_dhaka", "delivery_fee_outside", "free_delivery_threshold"]);

    if (error) throw error;
    const settings = new Map((data || []).map((row) => [row.key, Number(row.value)]));
    const isDhaka = /(dhaka|ঢাকা)/i.test(city);
    let fee = settings.get(isDhaka ? "delivery_fee_dhaka" : "delivery_fee_outside");
    if (!Number.isFinite(fee)) fee = isDhaka ? 80 : 130;
    fee = Math.max(0, fee);
    const threshold = Math.max(0, settings.get("free_delivery_threshold") || 0);
    if (threshold > 0 && subtotal >= threshold) fee = 0;

    return NextResponse.json(
      { success: true, delivery_fee: fee, currency: "BDT" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Delivery quote failed:", error);
    return NextResponse.json({ error: "ডেলিভারি চার্জ হিসাব করা যায়নি।" }, { status: 503 });
  }
}
