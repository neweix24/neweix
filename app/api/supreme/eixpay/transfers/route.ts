import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type SupremeAccess =
  | { ok: true; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> }
  | { ok: false; response: NextResponse };
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}
async function getSupremeAccess(): Promise<SupremeAccess> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, response: fail("লগইন প্রয়োজন।", 401) };
  const { data: staff, error: staffError } = await supabase
    .from("staff_profiles").select("role, is_active").eq("user_id", user.id).maybeSingle();
  if (staffError || !staff || staff.is_active !== true || staff.role !== "supreme") {
    return { ok: false, response: fail("শুধু সক্রিয় Supreme অ্যাকাউন্ট এই কাজ করতে পারবে।", 403) };
  }
  const { data: assurance, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { ok: false, response: fail("Supreme MFA যাচাই সম্পন্ন করুন।", 403) };
  }
  return { ok: true, supabase };
}
export async function GET() {
  try {
    const access = await getSupremeAccess();
    if (!access.ok) return access.response;
    const { data, error } = await access.supabase.rpc("eixpay_list_pending_transfers");
    if (error) {
      console.error("Supreme EixPay queue read failed:", error.code);
      return fail("ট্রান্সফার অনুরোধ লোড করা যায়নি।", error.code === "42501" ? 403 : 503);
    }
    return NextResponse.json({ success: true, requests: data ?? [] }, { headers });
  } catch (error) {
    console.error("Supreme EixPay transfer GET failed:", error);
    return fail("ট্রান্সফার অনুরোধ লোড করা যায়নি।", 500);
  }
}
export async function PATCH(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2048) return fail("অনুরোধটি অনেক বড়।", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("সঠিক JSON অনুরোধ দিন।", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("অনুরোধের তথ্য সঠিক নয়।", 400);
    const payload = body as Record<string, unknown>;
    const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
    const decision = payload.decision;
    const note = typeof payload.note === "string" ? payload.note.trim() : "";
    if (!UUID_REGEX.test(requestId) || (decision !== "approve" && decision !== "reject") || note.length > 500) {
      return fail("অনুমোদনের তথ্য সঠিক নয়।", 400);
    }
    const access = await getSupremeAccess();
    if (!access.ok) return access.response;
    const { data, error } = await access.supabase.rpc("eixpay_decide_transfer", {
      p_request_id: requestId, p_decision: decision, p_note: note,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "55000" ? 409 : error.code === "22023" ? 400 : 500;
      return fail(
        error.code === "55000" ? "অনুরোধটি আর অপেক্ষমাণ নেই অথবা ট্রান্সফার বর্তমানে বন্ধ আছে।"
          : error.code === "42501" ? "Supreme MFA অনুমোদন প্রয়োজন।" : "অনুরোধটি সম্পন্ন করা যায়নি।",
        status
      );
    }
    return NextResponse.json({ success: true, result: data }, { headers });
  } catch (error) {
    console.error("Supreme EixPay transfer decision failed:", error);
    return fail("অনুরোধটি সম্পন্ন করা যায়নি।", 500);
  }
}
