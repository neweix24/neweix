import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

type WarehouseAllocationAuthorization =
  | { userId: string }
  | { error: string; status: number };

async function authorize(): Promise<WarehouseAllocationAuthorization> {
  const session = await createServerSupabaseClient();
  const { data, error } = await session.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return { error: "Authentication required.", status: 401 };

  const { data: profile, error: profileError } = await session
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError || !profile || profile.is_active !== true ||
      !["supreme", "admin"].includes(profile.role)) {
    return { error: "Only active Admin or Supreme accounts can allocate warehouse stock.", status: 403 as const };
  }
  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance?.currentLevel !== "aal2") {
      return { error: "Complete MFA verification for the Supreme account.", status: 403 as const };
    }
  }
  return { userId };
}

export async function POST(request: Request) {
  try {
    const staff = await authorize();
    if ("error" in staff) return fail(staff.error, staff.status);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return fail("Request is too large.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("Provide valid JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request body.", 400);

    const orderId = (body as Record<string, unknown>).order_id;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof orderId !== "string" || !uuid.test(orderId)) return fail("Select a valid order.", 400);

    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin.rpc("allocate_order_to_warehouses", {
      p_order_id: orderId,
      p_actor_user_id: staff.userId,
    });

    if (error || !data) {
      const message = error?.message ?? "";
      if (message.includes("WAREHOUSE_ALLOCATION_ORDER_NOT_FOUND")) return fail("Order not found.", 404);
      if (message.includes("WAREHOUSE_ALLOCATION_ORDER_NOT_READY")) return fail("Only confirmed, processing, or packed orders can be allocated.", 409);
      if (message.includes("WAREHOUSE_ALLOCATION_ALREADY_EXISTS")) return fail("This order already has warehouse fulfillment allocations.", 409);
      if (message.includes("WAREHOUSE_ALLOCATION_PATHAO_ALREADY_BOOKED")) return fail("This order already has a courier booking or shipment in progress. Do not allocate it through the warehouse workflow.", 409);
      if (message.includes("WAREHOUSE_ALLOCATION_INSUFFICIENT_STOCK")) return fail("Insufficient reconciled stock across active warehouses. No stock was reserved and no shipment was created.", 409);
      if (message.includes("WAREHOUSE_ALLOCATION_PRODUCT_REFERENCE_MISSING")) return fail("An order item no longer references a valid product. Contact support.", 409);
      if (message.includes("WAREHOUSE_ALLOCATION_ACTOR_NOT_AUTHORIZED")) return fail("Your staff permissions do not allow warehouse allocation.", 403);
      if (message.includes("WAREHOUSE_ALLOCATION_")) return fail("Order cannot be allocated. Verify its status and items.", 400);
      console.error("Warehouse allocation RPC failed:", message);
      return fail("Warehouse allocation is temporarily unavailable.", 503);
    }

    return NextResponse.json({ success: true, allocation: data }, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Warehouse allocation API failed:", error);
    return fail("A server error occurred.", 500);
  }
}
