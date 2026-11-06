import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: profile, error: profileError } = await session
    .from("staff_profiles").select("role, is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "supreme" || profile.is_active !== true) {
    return { error: "Only an active Supreme account can manage product costs.", status: 403 as const };
  }
  const { data: assurance, error: mfaError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { error: "Complete MFA verification for the Supreme account.", status: 403 as const };
  }
  return { userId: user.id };
}

async function serviceClient() {
  const { env } = await getCloudflareContext();
  const runtimeEnv = env as Record<string, unknown>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== "string" || !url || typeof key !== "string" || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  try {
    const actor = await authorize();
    if ("error" in actor) return fail(actor.error, actor.status);
    const supabase = await serviceClient();
    const { data, error } = await supabase.from("products")
      .select("id, name, sku, purchase_cost, price")
      .order("name", { ascending: true })
      .limit(500);
    if (error) {
      console.error("Supreme product cost list failed:", error.message);
      return fail("Could not load product acquisition costs.", 500);
    }
    return NextResponse.json({ success: true, products: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Supreme product cost GET failed:", error);
    return fail("A server error occurred.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await authorize();
    if ("error" in actor) return fail(actor.error, actor.status);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return fail("Request is too large.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("Invalid JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Provide valid product cost details.", 400);
    const input = body as Record<string, unknown>;
    const uuid = typeof input.product_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.product_id);
    if (!uuid) return fail("Select a valid product.", 400);
    const cost = input.purchase_cost;
    if (cost !== null && (!Number.isSafeInteger(cost) || Number(cost) < 0 || Number(cost) > 1000000000)) {
      return fail("Enter a valid purchase cost in BDT, or null when unknown.", 400);
    }
    const supabase = await serviceClient();
    const { data, error } = await supabase.rpc("supreme_update_product_purchase_cost", {
      p_actor_id: actor.userId,
      p_product_id: input.product_id,
      p_purchase_cost: cost,
    });
    if (error || !data) {
      console.error("Supreme product cost update failed:", error?.message);
      if (error?.message.includes("PRODUCT_NOT_FOUND")) return fail("Product not found.", 404);
      if (error?.message.includes("SUPREME_ACTOR_NOT_AUTHORIZED")) return fail("Supreme authorization required.", 403);
      return fail("Could not save the product purchase cost.", 500);
    }
    return NextResponse.json({ success: true, product: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Supreme product cost PATCH failed:", error);
    return fail("A server error occurred.", 500);
  }
}
