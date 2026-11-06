import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function getSupremeActor() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await session.auth.getUser();

  if (userError || !user) {
    return { error: "Authentication required.", status: 401 as const };
  }

  const { data: profile, error } = await session
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true || profile.role !== "supreme") {
    return { error: "Only an active Supreme account can view this dashboard.", status: 403 as const };
  }

  const { data: assurance, error: mfaError } =
    await session.auth.mfa.getAuthenticatorAssuranceLevel();

  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { error: "Complete MFA verification for the Supreme account.", status: 403 as const };
  }

  return { userId: user.id };
}

async function getServiceClient() {
  const { env } = await getCloudflareContext();
  const runtimeEnv = env as Record<string, unknown>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (typeof url !== "string" || !url || typeof key !== "string" || !key) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseDate(value: string | null): string | null | false {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return new Date(timestamp).toISOString();
}

export async function GET(request: Request) {
  try {
    const actor = await getSupremeActor();
    if ("error" in actor) return errorResponse(actor.error, actor.status);

    const params = new URL(request.url).searchParams;
    const startAt = parseDate(params.get("from"));
    const endAt = parseDate(params.get("to"));

    if (startAt === false || endAt === false || (startAt && endAt && startAt >= endAt)) {
      return errorResponse("A valid date range is required.", 400);
    }

    const supabase = await getServiceClient();
    const { data, error } = await supabase.rpc("supreme_dashboard_summary", {
      p_start_at: startAt,
      p_end_at: endAt,
    });

    if (error) {
      console.error("Supreme dashboard summary RPC failed:", error.message);
      return errorResponse("Dashboard summary is temporarily unavailable.", 500);
    }

    return NextResponse.json(
      { success: true, summary: data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Supreme dashboard summary failed:", error);
    return errorResponse("A server error occurred.", 500);
  }
}
