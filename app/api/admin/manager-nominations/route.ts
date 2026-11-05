import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: { "cache-control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getServiceClient() {
  const { env } = await getCloudflareContext();
  const secret = (env as typeof env & { SUPABASE_SERVICE_ROLE_KEY?: string }).SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !url) return null;
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const session = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await session.auth.getUser();
    if (userError || !user) return response("Sign-in required.", 401);

    const { data: actor, error: actorError } = await session
      .from("staff_profiles").select("role, is_active").eq("user_id", user.id).maybeSingle();
    if (actorError || !actor || actor.role !== "admin" || actor.is_active !== true) {
      return response("Only an active Admin may propose a Manager appointment.", 403);
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(declaredLength) || declaredLength > 8192) return response("Request is too large.", 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return response("Request is too large.", 413);

    let body: unknown;
    try { body = JSON.parse(raw); } catch { return response("Invalid JSON.", 400); }
    if (!isRecord(body)) return response("Invalid request body.", 400);

    const candidateName = typeof body.candidateName === "string" ? body.candidateName.trim() : "";
    const candidateEmail = typeof body.candidateEmail === "string" ? body.candidateEmail.trim().toLowerCase() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (candidateName.length < 2 || candidateName.length > 120) return response("Candidate name must be 2–120 characters.", 400);
    if (candidateEmail.length < 5 || candidateEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) return response("Enter a valid candidate email.", 400);
    if (reason.length < 10 || reason.length > 2000) return response("Reason must be 10–2000 characters.", 400);

    const admin = await getServiceClient();
    if (!admin) return response("Server configuration is incomplete.", 500);
    const { data, error } = await admin.from("staff_manager_nominations").insert({
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      reason,
      requested_by: user.id,
    }).select("id, candidate_name, candidate_email, reason, status, created_at").single();

    if (error?.code === "23505") return response("A pending nomination already exists for this email.", 409);
    if (error || !data) return response("Could not submit the Manager nomination.", 500);
    return NextResponse.json({ success: true, nomination: data }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return response("Server error.", 500);
  }
}
