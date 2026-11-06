import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";
import { getPathaoStores } from "@/lib/pathao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    );
  }
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["data", "stores", "locations"]) {
    const value = record[key];
    if (Array.isArray(value)) return extractRows(value);
    if (value && typeof value === "object") {
      const nested = extractRows(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

export async function GET() {
  const session = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await session.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !userId) return response({ error: "Authentication required." }, 401);

  const { data: staff, error: staffError } = await session
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (staffError || !staff || staff.is_active !== true || !["supreme", "admin"].includes(staff.role)) {
    return response({ error: "Admin access required." }, 403);
  }
  if (staff.role === "supreme") {
    const { data: assurance, error } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || assurance.currentLevel !== "aal2") {
      return response({ error: "Complete MFA for the Supreme account." }, 403);
    }
  }

  const admin = await createRuntimeServiceClient();
  const { data: warehouses, error } = await admin
    .from("warehouses")
    .select("id, code, name, pathao_store_id, is_active")
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (error || !warehouses) {
    console.error("Warehouse Pathao diagnostics database read failed:", error?.message);
    return response({ error: "Could not load warehouse configuration." }, 503);
  }

  let stores: Array<Record<string, unknown>>;
  try {
    stores = extractRows(await getPathaoStores());
  } catch {
    return response({
      success: false,
      error: "Could not retrieve the merchant's Pathao store list. Check Pathao credentials, environment and merchant access.",
      checkedAt: new Date().toISOString(),
    }, 502);
  }

  const results = warehouses.map((warehouse) => {
    const storeId = Number(warehouse.pathao_store_id);
    if (!Number.isSafeInteger(storeId) || storeId < 1) {
      return {
        warehouse_id: warehouse.id,
        warehouse_code: warehouse.code,
        warehouse_name: warehouse.name,
        is_active: warehouse.is_active,
        configured_store_id: null,
        status: "not_configured" as const,
        detail: "No Pathao Store ID is configured for this dispatch origin.",
      };
    }
    const match = stores.find((store) => Number(store.store_id ?? store.id) === storeId);
    const matchedName = match && typeof match.store_name === "string"
      ? match.store_name
      : match && typeof match.name === "string" ? match.name : null;
    return {
      warehouse_id: warehouse.id,
      warehouse_code: warehouse.code,
      warehouse_name: warehouse.name,
      is_active: warehouse.is_active,
      configured_store_id: storeId,
      status: match ? "verified" as const : "not_found" as const,
      merchant_store_name: matchedName,
      detail: match
        ? "Store ID exists in the connected Pathao merchant account."
        : "Configured Store ID was not found in the connected Pathao merchant account.",
    };
  });

  return response({
    success: true,
    checkedAt: new Date().toISOString(),
    merchant_store_count: stores.length,
    results,
    note: "Read-only validation. No courier order is created and no warehouse configuration is changed.",
  });
}
