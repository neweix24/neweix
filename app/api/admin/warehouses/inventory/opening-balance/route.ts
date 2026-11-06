import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Authorization = { userId: string } | { error: string; status: number };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function authorize(): Promise<Authorization> {
  const session = await createServerSupabaseClient();
  const { data, error } = await session.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return { error: "Authentication required.", status: 401 };

  const { data: profile, error: profileError } = await session
    .from("staff_profiles").select("role, is_active").eq("user_id", userId).maybeSingle();
  if (profileError || !profile || profile.is_active !== true ||
      !["supreme", "admin"].includes(profile.role)) {
    return { error: "Only active Admin or Supreme accounts can reconcile stock.", status: 403 };
  }
  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance?.currentLevel !== "aal2") {
      return { error: "Complete MFA verification for the Supreme account.", status: 403 };
    }
  }
  return { userId };
}

export async function GET() {
  try {
    const staff = await authorize();
    if ("error" in staff) return fail(staff.error, staff.status);
    const admin = await createRuntimeServiceClient();
    const [{ data: warehouses, error: warehouseError }, { data: products, error: productError }] = await Promise.all([
      admin.from("warehouses").select("id, code, name, city, is_active").eq("is_active", true).order("name"),
      admin.from("products").select("id, name, slug, stock").eq("is_active", true).order("name").limit(5000),
    ]);
    if (warehouseError || productError) {
      console.error("Opening balance options failed:", warehouseError?.message ?? productError?.message);
      return fail("Could not load warehouse or product options.", 503);
    }
    return NextResponse.json({ success: true, warehouses: warehouses ?? [], products: products ?? [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Opening balance GET failed:", error);
    return fail("A server error occurred.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await authorize();
    if ("error" in staff) return fail(staff.error, staff.status);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8 * 1024) return fail("Request is too large.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("Provide valid JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request body.", 400);
    const input = body as Record<string, unknown>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const warehouseId = typeof input.warehouse_id === "string" ? input.warehouse_id : "";
    const productId = typeof input.product_id === "string" ? input.product_id : "";
    const quantity = input.quantity;
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (!uuid.test(warehouseId) || !uuid.test(productId)) return fail("Select a valid warehouse and product.", 400);
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000) {
      return fail("Quantity must be a whole number between 0 and 1,000,000.", 400);
    }
    if (note.length < 5 || note.length > 500) return fail("Explain the physical stock count (5–500 characters).", 400);

    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin.rpc("record_warehouse_opening_balance", {
      p_warehouse_id: warehouseId,
      p_product_id: productId,
      p_quantity: quantity,
      p_note: note,
      p_actor_user_id: staff.userId,
    });
    if (error || !data) {
      const message = error?.message ?? "";
      if (message.includes("OPENING_BALANCE_ALREADY_RECORDED")) {
        return fail("Opening balance already exists for this product at this warehouse. Use a separate audited stock adjustment; do not submit it again.", 409);
      }
      if (message.includes("WAREHOUSE_NOT_FOUND") || message.includes("PRODUCT_NOT_FOUND")) {
        return fail("The selected warehouse or product is unavailable.", 404);
      }
      if (message.includes("OPENING_BALANCE_")) return fail("Opening balance details are invalid. Check the quantity and note.", 400);
      console.error("Opening balance RPC failed:", message);
      return fail("Could not record the opening balance.", 503);
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId,
      action: "warehouse.opening_balance_recorded",
      target_type: "warehouse_inventory",
      target_id: data.inventory_id,
      details: {
        warehouse_id: warehouseId,
        product_id: productId,
        quantity,
        movement_id: data.movement_id ?? null,
      },
    });
    if (auditError) console.error("Opening balance audit event failed:", auditError.message);

    return NextResponse.json({ success: true, inventory: data }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Opening balance POST failed:", error);
    return fail("A server error occurred.", 500);
  }
}
