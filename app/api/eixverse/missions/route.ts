import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function fail(error: string, status: number) { return NextResponse.json({ error }, { status, headers }); }
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return fail("লগইন প্রয়োজন।", 401);
  const { data, error } = await supabase.rpc("eixverse_get_missions");
  if (error) { console.error("EixVerse missions GET:", error.code); return fail("মিশন লোড করা যায়নি।", 503); }
  return NextResponse.json({ success: true, data }, { headers });
}
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return fail("লগইন প্রয়োজন।", 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4096) return fail("অনুরোধটি অতিরিক্ত বড়।", 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("সঠিক JSON পাঠান।", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("সঠিক অনুরোধ পাঠান।", 400);
  const input = body as Record<string, unknown>;
  if (input.action === "checkin") {
    const { data, error } = await supabase.rpc("eixverse_daily_checkin");
    if (error) return fail("আজকের Check-in সম্পন্ন করা যায়নি।", error.code === "28000" ? 401 : 400);
    return NextResponse.json({ success: true, result: data }, { headers });
  }
  if (input.action === "claim" && typeof input.missionId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.missionId)
    && (input.evidenceId === undefined || input.evidenceId === null
      || typeof input.evidenceId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.evidenceId))) {
    const { data, error } = await supabase.rpc("eixverse_claim_mission", {
      p_mission_id: input.missionId, p_evidence_id: input.evidenceId ?? null,
    });
    if (error) {
      const status = error.code === "28000" ? 401 : error.code === "P0002" ? 404 : error.code === "42501" ? 403 : 409;
      const message = error.message.includes("MISSION_REWARD_NOT_AVAILABLE")
        ? "Eixon earning অথবা campaign_action reward rule চালু নেই।"
        : error.message.includes("MISSION_REQUIREMENT_NOT_MET") ? "মিশনের শর্ত এখনো পূরণ হয়নি।"
        : error.message.includes("MISSION_USER_LIMIT") || error.message.includes("MISSION_DAILY_LIMIT") ? "এই মিশনের Claim সীমা পূর্ণ হয়েছে।"
        : "মিশনের পুরস্কার Claim করা যায়নি।";
      return fail(message, status);
    }
    return NextResponse.json({ success: true, result: data }, { headers });
  }
  return fail("অ্যাকশন বা তথ্য সঠিক নয়।", 400);
}
