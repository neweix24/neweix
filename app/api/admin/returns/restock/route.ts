import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}

async function getStaffId() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
    return { error: "Authentication required.", status: 401 as const };
  }

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("role,is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.is_active !== true || !["supreme", "admin"].includes(profile.role)) {
    return { error: "You are not authorized to restore inventory.", status: 403 as const };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== "aal2") {
      return { error: "Complete MFA for the Supreme account.", status: 403 as const };
    }
  }

  return { userId };
}

async function getAdminClient() {
  const context = await getCloudflareContext();
  const env = context.env as Record<string, string | undefined>;
  const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffId();
    if ("error" in staff) return noStore({ error: staff.error }, staff.status);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) {
      return noStore({ error: "Request is too large." }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return noStore({ error: "Submit valid JSON." }, 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return noStore({ error: "Invalid restock request." }, 400);
    }
    const input = body as Record<string, unknown>;
    if (typeof input.request_id !== "string" || !UUID_PATTERN.test(input.request_id)) {
      return noStore({ error: "Provide a valid return request ID." }, 400);
    }
    const note = typeof input.note === "string" ? input.note.trim() : "Return received and inspected.";
    if (note.length < 5 || note.length > 500) {
      return noStore({ error: "Restock note must be between 5 and 500 characters." }, 400);
    }

    const admin = await getAdminClient();
    const { data, error } = await admin.rpc("admin_restock_customer_return_request", {
      p_request_id: input.request_id,
      p_actor_id: staff.userId,
      p_note: note,
    });

    if (error) {
      if (error.message.includes("RETURN_REQUEST_NOT_FOUND")) return noStore({ error: "Return request not found." }, 404);
      if (error.message.includes("RETURN_NOT_RECEIVED")) return noStore({ error: "Confirm that the returned goods have physically arrived before restocking." }, 409);
      if (error.message.includes("RESTOCK_QUANTITY_EXCEEDS_RETURNED")) return noStore({ error: "Restock quantity exceeds the remaining returned quantity." }, 409);
      if (error.message.includes("ACTOR_NOT_AUTHORIZED")) return noStore({ error: "You are not authorized to restore inventory." }, 403);
      console.error("Customer return restock RPC failed:", error.message);
      return noStore({ error: "Could not restore returned inventory." }, 500);
    }

    return noStore({ success: true, result: data, message: "Returned inventory restored and audit log recorded." });
  } catch (error) {
    console.error("Customer return restock failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}
