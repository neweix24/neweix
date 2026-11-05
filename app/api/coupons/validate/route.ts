import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return response("Request is too large.", 413);
    body = JSON.parse(raw);
  } catch {
    return response("Submit valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return response("Invalid coupon request.");
  const input = body as Record<string, unknown>;
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  const subtotal = input.subtotal;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return response("Enter a valid coupon code.");
  if (typeof subtotal !== "number" || !Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > 100_000_000) {
    return response("Invalid product subtotal.");
  }

  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, unknown>;
    const url = typeof runtimeEnv.NEXT_PUBLIC_SUPABASE_URL === "string"
      ? runtimeEnv.NEXT_PUBLIC_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = typeof runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === "string"
      ? runtimeEnv.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Coupon service configuration missing.");

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: coupon, error } = await supabase.from("coupons")
      .select("code,discount_type,discount_value,min_subtotal,max_discount,usage_limit,usage_count,starts_at,expires_at,is_active")
      .eq("code", code).eq("is_active", true).maybeSingle();

    if (error) throw error;
    const now = Date.now();
    if (!coupon || (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) ||
        (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now) ||
        (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit)) {
      return response("This coupon is invalid, expired, or no longer available.");
    }
    if (subtotal < coupon.min_subtotal) {
      return response("This coupon cannot be applied to the current subtotal.");
    }

    let discount = 0;
    let freeShipping = false;
    if (coupon.discount_type === "percentage") {
      discount = Math.floor(subtotal * coupon.discount_value / 100);
    } else if (coupon.discount_type === "fixed") {
      discount = Math.min(subtotal, coupon.discount_value);
    } else if (coupon.discount_type === "free_shipping") {
      freeShipping = true;
    }
    if (coupon.max_discount !== null) discount = Math.min(discount, coupon.max_discount);
    discount = Math.min(subtotal, Math.max(0, discount));

    return NextResponse.json({
      success: true,
      coupon: { code: coupon.code, discount, free_shipping: freeShipping },
      subtotal,
      discounted_subtotal: subtotal - discount,
      currency: "BDT",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Coupon validation failed:", error);
    return response("Coupon validation is temporarily unavailable. Please try again.", 503);
  }
}
