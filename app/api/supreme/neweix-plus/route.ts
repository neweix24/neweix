import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient, maskBangladeshPhone, normalizeBangladeshPhone } from "@/lib/phone-verification";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function fail(message: string, status: number) { return NextResponse.json({ error: message }, { status, headers }); }
async function getSupreme() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, response: fail("লগইন প্রয়োজন।", 401) };
  const { data: profile, error: profileError } = await supabase.from("staff_profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || profile.is_active !== true || profile.role !== "supreme") return { ok: false as const, response: fail("শুধু সক্রিয় Supreme অ্যাকাউন্ট এই কাজ করতে পারবে।", 403) };
  const { data: assurance, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") return { ok: false as const, response: fail("Supreme MFA যাচাই সম্পন্ন করুন।", 403) };
  return { ok: true as const, supabase };
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") ?? "").trim();
    if (query.length < 3 || query.length > 120) return fail("কমপক্ষে ৩ এবং সর্বোচ্চ ১২০ অক্ষরের অনুসন্ধান দিন।", 400);
    const access = await getSupreme();
    if (!access.ok) return access.response;

    const admin = createAdminSupabaseClient();
    const columns = "user_id,full_name,display_name,email,phone";
    let dbQuery = admin.from("customer_profiles").select(columns).limit(10);

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query)) {
      dbQuery = dbQuery.eq("user_id", query);
    } else if (query.includes("@")) {
      dbQuery = dbQuery.eq("email", query.toLowerCase());
    } else {
      const phone = normalizeBangladeshPhone(query);
      if (phone) {
        dbQuery = dbQuery.eq("phone", phone);
      } else {
        const safe = query.replace(/[,%_()\\\\]/g, "").trim();
        if (safe.length < 3) return fail("অনুসন্ধানের শব্দটি সঠিক নয়।", 400);
        dbQuery = dbQuery.or("full_name.ilike.%" + safe + "%,display_name.ilike.%" + safe + "%");
      }
    }

    const { data, error } = await dbQuery;
    if (error) {
      console.error("Neweix+ customer search failed:", error.code);
      return fail("গ্রাহক খোঁজা যায়নি।", 503);
    }

    const customers = (data ?? []).map((row) => ({
      user_id: row.user_id,
      name: row.full_name || row.display_name || "NEWEIX customer",
      email: row.email,
      masked_phone: row.phone ? maskBangladeshPhone(row.phone) : null,
    }));
    return NextResponse.json({ success: true, customers }, { headers });
  } catch (error) {
    console.error("Neweix+ customer search failed:", error);
    return fail("গ্রাহক খোঁজা যায়নি।", 500);
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

    if (input.action === "set_tier") {
      if (typeof input.tierCode !== "string" || !/^(free|silver|gold|platinum|diamond|vip)$/.test(input.tierCode)
        || typeof input.enabled !== "boolean"
        || (input.minSpend !== null && (typeof input.minSpend !== "number" || !Number.isSafeInteger(input.minSpend) || input.minSpend < 0))
        || (input.minOrders !== null && (typeof input.minOrders !== "number" || !Number.isSafeInteger(input.minOrders) || input.minOrders < 0))
        || typeof input.periodDays !== "number" || !Number.isSafeInteger(input.periodDays) || input.periodDays < 1 || input.periodDays > 3650
        || !Array.isArray(input.benefits) || input.benefits.length > 30
        || !input.benefits.every((item) => typeof item === "string" && item.length <= 240)) {
        return fail("মেম্বারশিপ স্তরের তথ্য সঠিক নয়।", 400);
      }
      const { data, error } = await access.supabase.rpc("neweix_plus_set_tier", {
        p_tier_code: input.tierCode,
        p_enabled: input.enabled,
        p_min_qualified_spend_bdt: input.minSpend,
        p_min_qualified_orders: input.minOrders,
        p_qualification_period_days: input.periodDays,
        p_benefits: input.benefits,
      });
      if (error) return fail(error.code === "42501" ? "Supreme MFA অনুমোদন প্রয়োজন।" : "মেম্বারশিপ স্তর সংরক্ষণ করা যায়নি।", error.code === "42501" ? 403 : 400);
      return NextResponse.json({ success: true, data }, { headers });
    }

    if (input.action === "assign") {
      if (typeof input.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.userId)
        || typeof input.tierCode !== "string" || !/^(free|silver|gold|platinum|diamond|vip)$/.test(input.tierCode)
        || (input.expiresAt !== null && (typeof input.expiresAt !== "string" || !Number.isFinite(Date.parse(input.expiresAt))))
        || typeof input.note !== "string" || input.note.length > 500) {
        return fail("সদস্যপদ বরাদ্দের তথ্য সঠিক নয়।", 400);
      }
      const { data, error } = await access.supabase.rpc("neweix_plus_assign_member", {
        p_user_id: input.userId,
        p_tier_code: input.tierCode,
        p_expires_at: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
        p_note: input.note,
      });
      if (error) return fail(error.code === "42501" ? "Supreme MFA অনুমোদন প্রয়োজন।" : "সদস্যপদ বরাদ্দ করা যায়নি।", error.code === "42501" ? 403 : 400);
      return NextResponse.json({ success: true, data }, { headers });
    }
    return fail("অজানা Neweix+ অ্যাকশন।", 400);
  } catch (error) {
    console.error("Neweix+ Supreme PATCH failed:", error);
    return fail("Neweix+ সেটিং সংরক্ষণ করা যায়নি।", 500);
  }
}
