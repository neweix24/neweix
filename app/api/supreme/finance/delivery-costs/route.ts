import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDERS = ["pathao", "neweix_own"] as const;
const COST_TYPES = ["delivery_charge", "return_charge", "rider_payment", "fuel", "toll", "packaging", "other"] as const;
const ENTRY_KINDS = ["charge", "refund"] as const;
const SOURCES = ["manual_receipt", "cashbook", "other"] as const;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function authorize() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { ok: false as const, error: "Authentication required.", status: 401 as const };
  const { data: profile, error: profileError } = await session.from("staff_profiles")
    .select("role, is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || profile?.role !== "supreme" || profile.is_active !== true) {
    return { ok: false as const, error: "Only an active Supreme account can manage delivery costs.", status: 403 as const };
  }
  const { data: assurance, error: mfaError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { ok: false as const, error: "Complete MFA verification for the Supreme account.", status: 403 as const };
  }
  return { ok: true as const, userId: user.id };
}

async function serviceClient() {
  const { env } = await getCloudflareContext();
  const runtimeEnv = env as Record<string, unknown>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== "string" || !url || typeof key !== "string" || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validDate(value: string | null): value is string {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function GET(request: Request) {
  try {
    const actor = await authorize();
    if (!actor.ok) return fail(actor.error, actor.status);
    const params = new URL(request.url).searchParams;
    const from = params.get("from"), to = params.get("to");
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
      return fail("Provide a valid delivery-cost date range.", 400);
    }
    const page = Math.max(1, Math.min(10000, Number(params.get("page") || 1)));
    const pageSize = 50;
    const supabase = await serviceClient();
    let query = supabase.from("delivery_cost_entries")
      .select("id, order_id, provider, cost_type, entry_kind, amount, cost_date, source_type, source_reference, notes, created_at", { count: "exact" })
      .order("cost_date", { ascending: false }).order("created_at", { ascending: false });
    if (from) query = query.gte("cost_date", from);
    if (to) query = query.lte("cost_date", to);
    const [{ data: entries, error: entriesError, count }, { data: summary, error: summaryError }, { data: orders, error: ordersError }] = await Promise.all([
      query.range((page - 1) * pageSize, page * pageSize - 1),
      supabase.rpc("supreme_delivery_cost_summary", { p_start_at: from ? from + "T00:00:00+06:00" : null, p_end_at: to ? to + "T23:59:59.999+06:00" : null }),
      supabase.from("orders").select("id, order_number, delivery_provider, status, delivery_status, delivery_fee, pathao_estimated_fee")
        .in("delivery_provider", ["pathao", "neweix_own"]).order("created_at", { ascending: false }).limit(100),
    ]);
    if (entriesError || summaryError || ordersError) {
      console.error("Supreme delivery cost query failed:", { entries: entriesError?.message, summary: summaryError?.message, orders: ordersError?.message });
      return fail("Could not load delivery cost information.", 503);
    }
    const orderMap = new Map((orders ?? []).map((order) => [order.id, order.order_number]));
    return NextResponse.json({
      success: true,
      entries: (entries ?? []).map((entry) => ({ ...entry, order_number: orderMap.get(entry.order_id) ?? null })),
      orders: orders ?? [],
      summary,
      pagination: { page, pageSize, total: count ?? 0 },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Supreme delivery cost GET failed:", error);
    return fail("A server error occurred.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize();
    if (!actor.ok) return fail(actor.error, actor.status);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return fail("Request is too large.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("Invalid JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Provide valid delivery cost details.", 400);
    const input = body as Record<string, unknown>;
    if (typeof input.order_id !== "string" || !UUID.test(input.order_id)) return fail("Select a valid order.", 400);
    if (typeof input.provider !== "string" || !PROVIDERS.includes(input.provider as typeof PROVIDERS[number])) return fail("Select a valid delivery provider.", 400);
    if (typeof input.cost_type !== "string" || !COST_TYPES.includes(input.cost_type as typeof COST_TYPES[number])) return fail("Select a valid cost category.", 400);
    if (typeof input.entry_kind !== "string" || !ENTRY_KINDS.includes(input.entry_kind as typeof ENTRY_KINDS[number])) return fail("Select charge or refund.", 400);
    if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1000000000 || Math.round(input.amount * 100) !== input.amount * 100) return fail("Enter a valid amount in BDT (up to 2 decimal places).", 400);
    if (typeof input.cost_date !== "string" || !validDate(input.cost_date)) return fail("Select a valid cost date.", 400);
    if (typeof input.source_type !== "string" || !SOURCES.includes(input.source_type as typeof SOURCES[number])) return fail("Select a valid source type.", 400);
    const reference = input.source_reference == null || input.source_reference === "" ? null : typeof input.source_reference === "string" ? input.source_reference.trim() : undefined;
    const notes = input.notes == null || input.notes === "" ? null : typeof input.notes === "string" ? input.notes.trim() : undefined;
    if (reference === undefined || (reference !== null && (reference.length < 1 || reference.length > 160))) return fail("Enter a valid receipt/reference.", 400);
    if (notes === undefined || (notes !== null && notes.length > 1000)) return fail("Notes must be at most 1,000 characters.", 400);

    const supabase = await serviceClient();
    const { data, error } = await supabase.rpc("supreme_record_delivery_cost", {
      p_actor_id: actor.userId, p_order_id: input.order_id, p_provider: input.provider,
      p_cost_type: input.cost_type, p_entry_kind: input.entry_kind, p_amount: Number(input.amount),
      p_cost_date: input.cost_date, p_source_type: input.source_type,
      p_source_reference: reference, p_notes: notes,
    });
    if (error || !data) {
      console.error("Supreme delivery cost save failed:", error?.message);
      if (error?.message.includes("SUPREME_ACTOR_NOT_AUTHORIZED")) return fail("Supreme authorization required.", 403);
      if (error?.message.includes("DELIVERY_COST_ORDER_NOT_FOUND")) return fail("Order not found.", 404);
      if (error?.message.includes("DELIVERY_COST_PROVIDER_MISMATCH")) return fail("The selected provider does not match this order.", 409);
      if (error?.code === "23505") return fail("This reference has already been recorded. Use a unique receipt/reference.", 409);
      return fail("Could not record the delivery cost.", 503);
    }
    return NextResponse.json({ success: true, entry: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Supreme delivery cost POST failed:", error);
    return fail("A server error occurred.", 500);
  }
}
