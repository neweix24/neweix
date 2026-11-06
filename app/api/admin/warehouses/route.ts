import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Staff = { userId: string } | { error: string; status: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function authorize(): Promise<Staff> {
  const session = await createServerSupabaseClient();
  const { data, error } = await session.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") {
    return { error: "Authentication required.", status: 401 };
  }

  const { data: profile, error: profileError } = await session
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.is_active !== true ||
      !["supreme", "admin"].includes(profile.role)) {
    return { error: "Only active Admin or Supreme accounts can manage warehouses.", status: 403 };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } =
      await session.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance?.currentLevel !== "aal2") {
      return { error: "Complete MFA verification for the Supreme account.", status: 403 };
    }
  }

  return { userId };
}

function cleanText(value: unknown, max: number, required = false): string | null | undefined {
  if (value === null || value === undefined || value === "") return required ? undefined : null;
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  if (!result || result.length > max) return required ? undefined : null;
  return result;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16 * 1024) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const staff = await authorize();
    if ("error" in staff) return responseError(staff.error, staff.status);

    const admin = await createRuntimeServiceClient();
    const [{ data: warehouses, error }, { data: inventory, error: inventoryError }] = await Promise.all([
      admin.from("warehouses")
        .select("id, code, name, city, district, division, address, contact_name, contact_phone, pathao_store_id, is_primary, is_active, created_at, updated_at")
        .order("is_primary", { ascending: false })
        .order("name", { ascending: true }),
      admin.from("warehouse_inventory")
        .select("warehouse_id, quantity_on_hand, quantity_reserved")
        .limit(10000),
    ]);

    if (error || inventoryError) {
      console.error("Warehouse list failed:", error?.message ?? inventoryError?.message);
      return responseError("Could not load warehouse configuration. Apply the multi-warehouse database migration first.", 503);
    }

    const totals = new Map<string, { skuCount: number; units: number; reserved: number }>();
    for (const row of inventory ?? []) {
      const current = totals.get(row.warehouse_id) ?? { skuCount: 0, units: 0, reserved: 0 };
      current.skuCount += 1;
      current.units += Number(row.quantity_on_hand);
      current.reserved += Number(row.quantity_reserved);
      totals.set(row.warehouse_id, current);
    }

    return NextResponse.json({
      success: true,
      warehouses: (warehouses ?? []).map((warehouse) => ({
        ...warehouse,
        inventory: totals.get(warehouse.id) ?? { skuCount: 0, units: 0, reserved: 0 },
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Warehouse GET failed:", error);
    return responseError("A server error occurred.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await authorize();
    if ("error" in staff) return responseError(staff.error, staff.status);
    const body = await readBody(request);
    if (!body) return responseError("Provide valid JSON (maximum 16 KB).", 400);

    const code = cleanText(body.code, 30, true);
    const name = cleanText(body.name, 120, true);
    const city = cleanText(body.city, 120, true);
    const district = cleanText(body.district, 120, true);
    const division = cleanText(body.division, 120, true);
    const address = cleanText(body.address, 500);
    const contactName = cleanText(body.contact_name, 120);
    const contactPhone = cleanText(body.contact_phone, 30);
    const pathaoStoreId = body.pathao_store_id == null || body.pathao_store_id === ""
      ? null : Number(body.pathao_store_id);
    if (!code || !/^[A-Z0-9_-]{2,30}$/.test(code) || !name || !city || !district || !division ||
        (body.pathao_store_id != null && body.pathao_store_id !== "" &&
          (!Number.isSafeInteger(pathaoStoreId) || Number(pathaoStoreId) < 1))) {
      return responseError("Warehouse code, name, city, district, division or Pathao Store ID is invalid.", 400);
    }

    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin.from("warehouses").insert({
      code, name, city, district, division, address, contact_name: contactName,
      contact_phone: contactPhone, pathao_store_id: pathaoStoreId,
      is_primary: false, is_active: true,
    }).select("id, code, name, city, district, division, address, contact_name, contact_phone, pathao_store_id, is_primary, is_active").single();

    if (error || !data) {
      if (error?.code === "23505") return responseError("This warehouse code is already in use.", 409);
      console.error("Warehouse create failed:", error?.message);
      return responseError("Could not create the warehouse.", 503);
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId, action: "warehouse.created", target_type: "warehouse",
      target_id: data.id, details: { code, city, district, pathao_store_id: pathaoStoreId },
    });
    if (auditError) console.error("Warehouse audit log failed:", auditError.message);

    return NextResponse.json({ success: true, warehouse: data }, {
      status: 201, headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Warehouse POST failed:", error);
    return responseError("A server error occurred.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const staff = await authorize();
    if ("error" in staff) return responseError(staff.error, staff.status);
    const body = await readBody(request);
    if (!body) return responseError("Provide valid JSON (maximum 16 KB).", 400);

    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return responseError("A valid warehouse ID is required.", 400);
    }

    const updates: Record<string, unknown> = {};
    const textFields = [
      ["name", 120], ["city", 120], ["district", 120], ["division", 120],
      ["address", 500], ["contact_name", 120], ["contact_phone", 30],
    ] as const;
    for (const [field, max] of textFields) {
      if (field in body) {
        const value = cleanText(body[field], max, ["name", "city", "district", "division"].includes(field));
        if (value === undefined) return responseError(`Invalid ${field.replaceAll("_", " ")}.`, 400);
        updates[field] = value;
      }
    }

    if ("pathao_store_id" in body) {
      const value = body.pathao_store_id == null || body.pathao_store_id === "" ? null : Number(body.pathao_store_id);
      if (value !== null && (!Number.isSafeInteger(value) || value < 1)) {
        return responseError("Pathao Store ID must be a positive integer.", 400);
      }
      updates.pathao_store_id = value;
    }
    if ("is_active" in body) {
      if (typeof body.is_active !== "boolean") return responseError("Active status must be true or false.", 400);
      updates.is_active = body.is_active;
    }
    if (!Object.keys(updates).length) return responseError("No valid warehouse changes were provided.", 400);
    updates.updated_at = new Date().toISOString();

    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin.from("warehouses").update(updates).eq("id", id)
      .select("id, code, name, city, district, division, address, contact_name, contact_phone, pathao_store_id, is_primary, is_active").maybeSingle();
    if (error || !data) {
      console.error("Warehouse update failed:", error?.message);
      return responseError("Could not update this warehouse.", error?.code === "23503" ? 409 : 503);
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId, action: "warehouse.updated", target_type: "warehouse",
      target_id: id, details: updates,
    });
    if (auditError) console.error("Warehouse update audit log failed:", auditError.message);

    return NextResponse.json({ success: true, warehouse: data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Warehouse PATCH failed:", error);
    return responseError("A server error occurred.", 500);
  }
}
