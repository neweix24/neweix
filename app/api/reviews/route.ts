import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function GET(request: Request) {
  try {
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    if (!UUID.test(productId)) return fail("পণ্যের পরিচিতি সঠিক নয়।", 400);

    const supabase = await createServerSupabaseClient();
    const [reviewsResult, authResult] = await Promise.all([
      supabase.rpc("eixpay_list_product_reviews", { p_product_id: productId }),
      supabase.auth.getUser(),
    ]);
    if (reviewsResult.error) {
      console.error("Product reviews read failed:", reviewsResult.error.code);
      return fail("রিভিউ লোড করা যায়নি।", 503);
    }

    let eligibleOrders: unknown[] = [];
    if (authResult.data.user) {
      const { data, error } = await supabase.rpc("eixpay_list_review_eligible_orders", { p_product_id: productId });
      if (error) {
        console.error("Review eligibility lookup failed:", error.code);
        return fail("রিভিউ দেওয়ার যোগ্যতা যাচাই করা যায়নি।", 503);
      }
      eligibleOrders = data ?? [];
    }

    return NextResponse.json({ success: true, reviews: reviewsResult.data ?? [], eligibleOrders }, { headers });
  } catch (error) {
    console.error("Product reviews GET failed:", error);
    return fail("রিভিউ লোড করা যায়নি।", 500);
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return fail("রিভিউটি অতিরিক্ত বড়।", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("সঠিক JSON পাঠান।", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("রিভিউয়ের তথ্য সঠিক নয়।", 400);

    const input = body as Record<string, unknown>;
    if (typeof input.productId !== "string" || !UUID.test(input.productId)
      || typeof input.orderItemId !== "string" || !UUID.test(input.orderItemId)
      || typeof input.rating !== "number" || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5
      || typeof input.title !== "string" || input.title.trim().length < 3 || input.title.trim().length > 120
      || typeof input.body !== "string" || input.body.trim().length < 20 || input.body.trim().length > 2000) {
      return fail("রেটিং, শিরোনাম, মতামত ও অর্ডারের তথ্য যাচাই করুন।", 400);
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return fail("রিভিউ দিতে লগইন করুন।", 401);

    const { data, error } = await supabase.rpc("eixpay_submit_product_review", {
      p_product_id: input.productId,
      p_order_item_id: input.orderItemId,
      p_rating: input.rating,
      p_title: input.title.trim(),
      p_body: input.body.trim(),
    });
    if (error) {
      const status = error.code === "28000" ? 401 : error.code === "42501" ? 403
        : error.code === "23505" ? 409 : error.code === "22023" ? 400 : 500;
      const message = error.message.includes("VERIFIED_PURCHASE_REQUIRED")
        ? "শুধু পণ্যটি কেনা, পেমেন্ট সম্পন্ন ও ডেলিভারি পাওয়া গ্রাহক রিভিউ দিতে পারবেন।"
        : error.message.includes("REVIEW_ALREADY_SUBMITTED")
          ? "এই অর্ডারের পণ্যটির জন্য আপনি ইতিমধ্যে রিভিউ দিয়েছেন।"
          : "রিভিউ জমা দেওয়া যায়নি।";
      return fail(message, status);
    }
    return NextResponse.json({ success: true, result: data }, { status: 201, headers });
  } catch (error) {
    console.error("Product review POST failed:", error);
    return fail("রিভিউ জমা দেওয়া যায়নি।", 500);
  }
}
