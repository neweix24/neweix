import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";
import { getPathaoConfig, getPathaoStoreId, getPathaoStores } from "@/lib/pathao";

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
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !userId) {
    return response({ error: "Authentication required." }, 401);
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (staffError || !staff || staff.is_active !== true || !["supreme", "admin"].includes(staff.role)) {
    return response({ error: "Admin access required." }, 403);
  }

  if (staff.role === "supreme") {
    const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || assurance.currentLevel !== "aal2") {
      return response({ error: "Complete MFA for the Supreme account." }, 403);
    }
  }

  const checks: Record<string, { ok: boolean; detail: string }> = {};
  let configuredStoreId: number | null = null;

  try {
    const config = await getPathaoConfig();
    checks.credentials = { ok: true, detail: "Pathao credentials are configured." };
    checks.environment = {
      ok: true,
      detail: config.baseUrl.includes("sandbox") ? "Sandbox API" : "Production API",
    };
  } catch {
    checks.credentials = { ok: false, detail: "One or more Pathao API credentials or the API host are missing or invalid." };
  }

  try {
    configuredStoreId = await getPathaoStoreId();
    checks.store_id = { ok: true, detail: "A valid Pathao Store ID is configured." };
  } catch {
    checks.store_id = { ok: false, detail: "PATHAO_STORE_ID is missing or is not a positive integer." };
  }

  if (checks.credentials.ok && configuredStoreId !== null) {
    try {
      const storeRows = extractRows(await getPathaoStores());
      const store = storeRows.find((row) =>
        Number(row.store_id ?? row.id) === configuredStoreId
      );
      checks.store_account_match = store
        ? { ok: true, detail: "Configured Store ID exists in the connected Pathao merchant account." }
        : { ok: false, detail: "Configured Store ID was not found in the connected Pathao merchant account." };
    } catch {
      checks.store_account_match = {
        ok: false,
        detail: "Could not retrieve stores from Pathao. Check credentials, API environment, and merchant access.",
      };
    }
  } else {
    checks.store_account_match = {
      ok: false,
      detail: "Cannot verify the store until credentials and Store ID are configured.",
    };
  }

  const admin = await createRuntimeServiceClient();
  const [allMappings, verifiedMappings] = await Promise.all([
    admin.from("pathao_location_mappings").select("id", { count: "exact", head: true }),
    admin.from("pathao_location_mappings").select("id", { count: "exact", head: true })
      .eq("is_verified", true).eq("is_active", true),
  ]);

  if (allMappings.error || verifiedMappings.error) {
    checks.location_mappings = {
      ok: false,
      detail: "Could not read Pathao location mappings. Verify the database migration and service configuration.",
    };
  } else {
    const total = allMappings.count ?? 0;
    const verified = verifiedMappings.count ?? 0;
    checks.location_mappings = {
      ok: verified > 0,
      detail: `${verified} active verified mappings out of ${total} saved mappings.`,
    };
  }

  const ok = Object.values(checks).every((item) => item.ok);
  return response({
    success: true,
    healthy: ok,
    checkedAt: new Date().toISOString(),
    checks,
    note: "This diagnostic never returns API credentials, tokens, or secret values. A successful configuration check does not replace a real destination-specific price quote.",
  });
}
