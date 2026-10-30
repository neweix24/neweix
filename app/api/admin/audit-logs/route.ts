import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

async function getSupremeContext() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await session.auth.getUser();

  if (authError || !user) {
    return { error: "লগইন আবশ্যক।", status: 401 as const };
  }

  const { data: profile, error: profileError } = await session
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active !== true || profile.role !== "supreme") {
    return { error: "শুধু সক্রিয় Supreme অ্যাকাউন্ট এই তথ্য দেখতে পারবে।", status: 403 as const };
  }

  const { data: assurance, error: mfaError } =
    await session.auth.mfa.getAuthenticatorAssuranceLevel();

  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { error: "Supreme অ্যাকাউন্টের MFA যাচাই সম্পন্ন করুন।", status: 403 as const };
  }

  return { user };
}

async function getAdminClient() {
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

export async function GET(request: Request) {
  try {
    const access = await getSupremeContext();
    if ("error" in access) return fail(access.error, access.status);

    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit") ?? "50";
    const limit = Number(rawLimit);
    const cursor = url.searchParams.get("cursor");
    const actorId = url.searchParams.get("actor_id");
    const action = url.searchParams.get("action")?.trim();
    const targetType = url.searchParams.get("target_type")?.trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return fail("limit 1 থেকে 100-এর মধ্যে হতে হবে।", 400);
    }
    if (cursor !== null && (!/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor)) || Number(cursor) < 1)) {
      return fail("সঠিক pagination cursor দিন।", 400);
    }
    if (actorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)) {
      return fail("সঠিক actor ID দিন।", 400);
    }
    if ((action && action.length > 100) || (targetType && targetType.length > 100)) {
      return fail("Filter 100 অক্ষরের মধ্যে রাখুন।", 400);
    }
    if (from && !Number.isFinite(Date.parse(from))) return fail("শুরুর তারিখ সঠিক নয়।", 400);
    if (to && !Number.isFinite(Date.parse(to))) return fail("শেষের তারিখ সঠিক নয়।", 400);
    if (from && to && Date.parse(from) > Date.parse(to)) return fail("তারিখের সীমা সঠিক নয়।", 400);

    const admin = await getAdminClient();
    let query = admin
      .from("audit_logs")
      .select("id, actor_id, action, target_type, target_id, created_at")
      .order("id", { ascending: false })
      .limit(limit);

    if (cursor) query = query.lt("id", Number(cursor));
    if (actorId) query = query.eq("actor_id", actorId);
    if (action) query = query.ilike("action", `%${action.replace(/[,%_]/g, "")}%`);
    if (targetType) query = query.eq("target_type", targetType);
    if (from) query = query.gte("created_at", new Date(from).toISOString());
    if (to) query = query.lte("created_at", new Date(to).toISOString());

    const { data, error } = await query;
    if (error) {
      console.error("Audit log query failed:", { code: error.code, message: error.message });
      return fail("অডিট লগ লোড করা যায়নি।", 500);
    }

    const logs = data ?? [];
    const nextCursor = logs.length === limit ? String(logs[logs.length - 1].id) : null;

    return NextResponse.json(
      { success: true, logs, nextCursor },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Audit logs GET failed:", error);
    return fail("সার্ভারে সমস্যা হয়েছে।", 500);
  }
}
