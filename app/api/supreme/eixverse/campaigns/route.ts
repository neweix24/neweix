import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function fail(error: string, status: number) { return NextResponse.json({ error }, { status, headers }); }
async function supreme() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, response: fail("লগইন প্রয়োজন।",401) };
  const { data: profile, error: profileError } = await supabase.from("staff_profiles")
    .select("role,is_active").eq("user_id",user.id).maybeSingle();
  if (profileError || profile?.is_active !== true || profile.role !== "supreme")
    return { ok: false as const, response: fail("শুধু সক্রিয় Supreme অ্যাকাউন্ট অনুমোদিত।",403) };
  const { data: assurance, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2")
    return { ok: false as const, response: fail("Supreme MFA যাচাই সম্পন্ন করুন।",403) };
  return { ok: true as const, supabase };
}
export async function GET() {
  const access = await supreme();
  if (!access.ok) return access.response;
  const { data, error } = await access.supabase.rpc("eixverse_supreme_list_campaigns");
  if (error) return fail("Campaign তালিকা লোড করা যায়নি।",503);
  return NextResponse.json({ success:true, campaigns:data ?? [] },{headers});
}
export async function POST(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8192) return fail("অনুরোধটি অতিরিক্ত বড়।",413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("সঠিক JSON পাঠান।",400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("সঠিক অনুরোধ পাঠান।",400);
  const input = body as Record<string,unknown>;
  if (input.action !== "campaign" && input.action !== "mission") return fail("অ্যাকশন সঠিক নয়।",400);
  const access = await supreme();
  if (!access.ok) return access.response;
  const rpc = input.action === "campaign" ? "eixverse_supreme_save_campaign" : "eixverse_supreme_save_mission";
  const { data, error } = await access.supabase.rpc(rpc, {
    [input.action === "campaign" ? "p_campaign" : "p_mission"]: input.data,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 400;
    return fail("Campaign বা Mission সংরক্ষণ করা যায়নি। তথ্য ও সময়সীমা যাচাই করুন.",status);
  }
  return NextResponse.json({ success:true, result:data },{headers});
}
