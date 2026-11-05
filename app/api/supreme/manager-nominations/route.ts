import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

async function authorizeSupreme() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await session.auth.getUser();
  if (userError || !user) return { error: response("Sign-in required.", 401) };

  const { data: profile, error: profileError } = await session
    .from("staff_profiles").select("role, is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "supreme" || profile.is_active !== true) {
    return { error: response("Supreme access required.", 403) };
  }

  const { data: assurance, error: assuranceError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== "aal2") {
    return { error: response("Complete Supreme MFA verification.", 403) };
  }
  return { user };
}

async function getServiceClient() {
  const { env } = await getCloudflareContext();
  const secret = (env as typeof env & { SUPABASE_SERVICE_ROLE_KEY?: string }).SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !url) return null;
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  try {
    const access = await authorizeSupreme();
    if ("error" in access) return access.error;
    const admin = await getServiceClient();
    if (!admin) return response("Server configuration is incomplete.", 500);
    const { data, error } = await admin.from("staff_manager_nominations")
      .select("id, candidate_name, candidate_email, reason, status, requested_by, reviewed_by, review_note, reviewed_at, created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) return response("Could not load Manager nominations.", 500);
    return NextResponse.json({ nominations: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch {
    return response("Server error.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await authorizeSupreme();
    if ("error" in access) return access.error;

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(declaredLength) || declaredLength > 4096) return response("Request is too large.", 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return response("Request is too large.", 413);

    let body: unknown;
    try { body = JSON.parse(raw); } catch { return response("Invalid JSON.", 400); }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return response("Invalid request body.", 400);
    const input = body as Record<string, unknown>;
    const id = typeof input.id === "string" ? input.id : "";
    const status = input.status;
    const reviewNote = typeof input.reviewNote === "string" ? input.reviewNote.trim() : null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return response("Invalid nomination ID.", 400);
    if (status !== "approved" && status !== "rejected") return response("Decision must be approved or rejected.", 400);
    if (reviewNote !== null && reviewNote.length > 1000) return response("Review note is too long.", 400);

    const admin = await getServiceClient();
    if (!admin) return response("Server configuration is incomplete.", 500);
    const { data, error } = await admin.from("staff_manager_nominations").update({
      status,
      reviewed_by: access.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "pending")
      .select("id, candidate_name, candidate_email, status, reviewed_by, reviewed_at, review_note")
      .maybeSingle();

    if (error) return response("Could not update the nomination.", 500);
    if (!data) return response("Nomination not found or it has already been reviewed.", 409);
    return NextResponse.json({
      success: true,
      nomination: data,
      nextStep: status === "approved"
        ? "Nomination approved. Supreme must create the Manager account through the protected staff provisioning flow."
        : "Nomination rejected.",
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return response("Server error.", 500);
  }
}
