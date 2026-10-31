import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}

async function getSupreme() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, response: fail("লগইন প্রয়োজন।", 401) };
  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || profile.is_active !== true || profile.role !== "supreme") {
    return { ok: false as const, response: fail("শুধু সক্রিয় Supreme অ্যাকাউন্ট এই কাজ করতে পারবে।", 403) };
  }
  const { data: assurance, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { ok: false as const, response: fail("Supreme MFA যাচাই সম্পন্ন করুন।", 403) };
  }
  return { ok: true as const, supabase };
}

export async function GET() {
  try {
    const access = await getSupreme();
    if (!access.ok) return access.response;
    const { data, error } = await access.supabase.rpc("eixpay_supreme_list_product_reviews");
    if (error) {
      console.error("Supreme review queue failed:", error.code);
      return fail("রিভিউ তালিকা লোড করা যায়নি।", 503);
    }
    return NextResponse.json({ success: true, reviews: data ?? [] }, { headers });
  } catch (error) {
    console.error("Supreme reviews GET failed:", error);
    return fail("রিভিউ তালিকা লোড করা যায়নি।", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return fail("অনুরোধটি অতিরিক্ত বড়।", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("সঠিক JSON পাঠান।", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("সঠিক অনুরোধ পাঠান।", 400);
    const input = body as Record<string, unknown>;
    if (typeof input.reviewId !== "string" || !UUID.test(input.reviewId)
      || (input.decision !== "approve" && input.decision !== "reject")
      || (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 500))) {
      return fail("রিভিউ সিদ্ধান্তের তথ্য সঠিক নয়।", 400);
    }

    const access = await getSupreme();
    if (!access.ok) return access.response;
    const { data, error } = await access.supabase.rpc("eixpay_supreme_decide_product_review", {
      p_review_id: input.reviewId,
      p_decision: input.decision,
      p_note: typeof input.note === "string" ? input.note.trim() : "",
    });
    if (error) {
      const status = error.code === "28000" ? 401 : error.code === "42501" ? 403
        : error.code === "P0002" ? 404 : error.code === "55000" ? 409 : 400;
      const message = error.message.includes("REVIEW_REWARD_NOT_AVAILABLE")
        ? "Eixon earning বা verified review reward rule চালু নেই। আগে EixPay Control-এ নিয়ম চালু করুন।"
        : error.code === "55000" ? "এই রিভিউয়ের সিদ্ধান্ত আগে দেওয়া হয়েছে।"
        : error.code === "P0002" ? "রিভিউটি পাওয়া যায়নি।"
        : "রিভিউয়ের সিদ্ধান্ত সংরক্ষণ করা যায়নি।";
      return fail(message, status);
    }
    return NextResponse.json({ success: true, result: data }, { headers });
  } catch (error) {
    console.error("Supreme review decision failed:", error);
    return fail("রিভিউয়ের সিদ্ধান্ত সংরক্ষণ করা যায়নি।", 500);
  }
}
