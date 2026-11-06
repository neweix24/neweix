import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}

type SupremeAccess =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: 401 | 403 };

async function getSupremeAccess(): Promise<SupremeAccess> {
  const session = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return { ok: false, error: "Authentication required.", status: 401 };

  const { data: profile, error: profileError } = await session
    .from("staff_profiles")
    .select("role,is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "supreme" || profile.is_active !== true) {
    return { ok: false, error: "Only an active Supreme account can access this inbox.", status: 403 };
  }

  const { data: assurance, error: mfaError } =
    await session.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { ok: false, error: "Complete MFA verification for the Supreme account.", status: 403 };
  }

  return { ok: true, userId: user.id };
}

async function getServiceClient() {
  const { env } = await getCloudflareContext();
  const runtimeEnv = env as Record<string, unknown>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== "string" || !url || typeof key !== "string" || !key) {
    throw new Error("Supabase server configuration is missing.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  try {
    const access = await getSupremeAccess();
    if (!access.ok) return noStore({ error: access.error }, access.status);

    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const beforeId = url.searchParams.get("before_id");
    if ((before && !Number.isFinite(Date.parse(before))) ||
        (beforeId && !UUID_PATTERN.test(beforeId)) ||
        Boolean(before) !== Boolean(beforeId)) {
      return noStore({ error: "Invalid notification cursor." }, 400);
    }

    const supabase = await getServiceClient();
    let listQuery = supabase
      .from("supreme_notifications")
      .select("id,category,severity,title,body,href,entity_type,entity_id,created_at,read_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (before && beforeId) {
      listQuery = listQuery.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`);
    }

    const [listResult, unreadResult] = await Promise.all([
      listQuery,
      supabase
        .from("supreme_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
    ]);

    if (listResult.error || unreadResult.error) {
      console.error("Supreme notification query failed:", listResult.error?.message ?? unreadResult.error?.message);
      return noStore({ error: "Could not load Supreme notifications." }, 500);
    }

    const rows = listResult.data ?? [];
    const hasMore = rows.length > PAGE_SIZE;
    const notifications = rows.slice(0, PAGE_SIZE);
    const last = notifications.at(-1);

    return noStore({
      notifications,
      unread_count: unreadResult.count ?? 0,
      has_more: hasMore,
      next_cursor: hasMore && last ? { before: last.created_at, before_id: last.id } : null,
    });
  } catch (error) {
    console.error("Supreme notifications GET failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getSupremeAccess();
    if (!access.ok) return noStore({ error: access.error }, access.status);

    let body: unknown;
    try { body = await request.json(); } catch { return noStore({ error: "Invalid request body." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return noStore({ error: "Invalid request body." }, 400);
    }

    const input = body as Record<string, unknown>;
    const supabase = await getServiceClient();
    let query = supabase
      .from("supreme_notifications")
      .update({ read_at: new Date().toISOString(), read_by: access.userId })
      .is("read_at", null);

    if (input.mark_all_read === true) {
      // Update every unread Supreme alert.
    } else if (typeof input.id === "string" && UUID_PATTERN.test(input.id)) {
      query = query.eq("id", input.id);
    } else {
      return noStore({ error: "Provide a valid notification ID or mark_all_read." }, 400);
    }

    const { data, error } = await query.select("id");
    if (error) {
      console.error("Supreme notification update failed:", error.message);
      return noStore({ error: "Could not update notifications." }, 500);
    }

    return noStore({ updated: data?.length ?? 0 });
  } catch (error) {
    console.error("Supreme notifications PATCH failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}
