import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";
import { BANGLADESH_ADMIN_AREAS, resolveBangladeshAddress } from "@/lib/bangladesh-admin";
import {
  calculatePathaoPrice,
  createPathaoOrder,
  getPathaoAreas,
  getPathaoAreasForZones,
  getPathaoCities,
  getPathaoZones,
  getPathaoZonesForCities,
  getPathaoConfig,
  getPathaoOrderInfo,
  getPathaoStores,
  testPathaoConnection,
} from "@/lib/pathao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminAuthResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; error: string; status: number };

async function authorizeAdmin(): Promise<AdminAuthResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const claimSubject = data?.claims?.sub;
  const userId = typeof claimSubject === "string" ? claimSubject : null;
  if (authError || !userId) {
    return { ok: false, error: "Authentication required.", status: 401 };
  }

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true ||
      !["supreme", "admin"].includes(profile.role)) {
    return { ok: false, error: "You are not authorized to perform this action.", status: 403 };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance.currentLevel !== "aal2") {
      return { ok: false, error: "Complete MFA for the Supreme account.", status: 403 };
    }
  }

  return { ok: true, userId, role: profile.role };
}


function extractPathaoRows(payload: unknown): Array<Record<string, unknown>> {
  const rowArray = (value: unknown): Array<Record<string, unknown>> | null => {
    if (!Array.isArray(value)) return null;
    return value.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    );
  };

  const visit = (value: unknown, depth: number): Array<Record<string, unknown>> => {
    if (depth > 6 || !value || typeof value !== "object") return [];
    const direct = rowArray(value);
    if (direct) return direct;

    const record = value as Record<string, unknown>;
    // Pathao's documented response is data.data, but tolerate common
    // wrappers used by API gateways and SDK response serializers.
    for (const key of ["data", "areas", "area_list", "areaList", "locations", "result", "results"]) {
      if (!(key in record)) continue;
      const rows = visit(record[key], depth + 1);
      if (rows.length > 0) return rows;
    }
    return [];
  };

  return visit(payload, 0);
}

function normalizePathaoPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  const staff = await authorizeAdmin();
  if (!staff.ok) return errorResponse(staff.error, staff.status);

  const params = new URL(request.url).searchParams;
  const action = params.get("action") || "status";

  try {
    if (action === "status") {
      const connection = await testPathaoConnection();
      return NextResponse.json({
        connected: true,
        environment: connection.environment,
        message: "Pathao authentication succeeded.",
      }, { headers: { "Cache-Control": "no-store" } });
    }


    if (action === "location_mappings") {
      const admin = await createRuntimeServiceClient();
      const { data: mappings, error } = await admin
        .from("pathao_location_mappings")
        .select("id, division_code, district_code, upazila_code, pathao_city_id, pathao_zone_id, pathao_city_name, pathao_zone_name, is_verified, is_active, verified_at, updated_at")
        .order("district_code", { ascending: true })
        .order("upazila_code", { ascending: true })
        .limit(1000);
      if (error) {
        console.error("Pathao location mappings query failed:", error.message);
        return errorResponse("Could not load Pathao location mappings. Apply the latest database migration first.", 503);
      }
      return NextResponse.json({ success: true, mappings: mappings ?? [] }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (action === "area_catalog") {
      const admin = await createRuntimeServiceClient();
      const { data: areas, error } = await admin
        .from("pathao_area_catalog")
        .select("id, pathao_city_id, pathao_zone_id, pathao_area_id, pathao_area_name, home_delivery_available, is_active, synced_at")
        .eq("is_active", true)
        .order("pathao_city_id", { ascending: true })
        .order("pathao_zone_id", { ascending: true })
        .order("pathao_area_name", { ascending: true })
        .limit(5000);
      if (error) {
        console.error("Pathao area catalog query failed:", error.message);
        return errorResponse("Could not load the Pathao Area catalog. Apply the area catalog migration first.", 503);
      }
      return NextResponse.json({ success: true, areas: areas ?? [] }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (action === "settlement_imports") {
      const admin = await createRuntimeServiceClient();
      const { data: imports, error: importsError } = await admin
        .from("pathao_settlement_imports")
        .select("id, settlement_reference, settlement_date, source_filename, row_count, matched_count, mismatch_count, unmatched_count, imported_at, notes, expected_payout_amount, actual_received_amount, payout_variance, receipt_reference, received_at, reconciliation_status")
        .order("imported_at", { ascending: false })
        .limit(20);
      if (importsError) {
        console.error("Pathao settlement import history failed:", importsError.message);
        return errorResponse("Could not load Pathao settlement history. Verify the database migration.", 503);
      }
      const requestedImportId = params.get("importId");
      const selectedImportId = requestedImportId && UUID_REGEX.test(requestedImportId)
        ? requestedImportId
        : imports?.[0]?.id ?? null;
      let rows: Array<Record<string, unknown>> = [];
      if (selectedImportId && (imports ?? []).some((item) => item.id === selectedImportId)) {
        const { data, error } = await admin
          .from("pathao_settlement_rows")
          .select("id, import_id, source_row_number, source_identifier, consignment_id, merchant_order_id, cod_amount, delivery_charge, discount_amount, net_payout_amount, expected_cod_amount, variance_amount, match_status, matched_order_id")
          .eq("import_id", selectedImportId)
          .order("source_row_number", { ascending: true })
          .limit(1000);
        if (error) {
          console.error("Pathao settlement rows query failed:", error.message);
          return errorResponse("Could not load Pathao settlement rows.", 503);
        }
        rows = (data ?? []) as Array<Record<string, unknown>>;
      }
      return NextResponse.json({ success: true, imports: imports ?? [], selectedImportId, rows }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (action === "delivery_operations") {
      const consignmentId = params.get("consignmentId") || "";
      if (!/^[A-Za-z0-9-]{3,80}$/.test(consignmentId)) {
        return errorResponse("Provide a valid Pathao Consignment ID.", 400);
      }
      const admin = await createRuntimeServiceClient();
      const { data: operations, error } = await admin
        .from("pathao_delivery_operations")
        .select("id, consignment_id, operation_type, operation_status, related_consignment_id, notes, created_at")
        .eq("consignment_id", consignmentId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("Pathao delivery operations history failed:", error.message);
        return errorResponse("Could not load Pathao operation history.", 503);
      }
      return NextResponse.json({ success: true, operations: operations ?? [] }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    await getPathaoConfig();

    if (action === "stores") {
      return NextResponse.json({ success: true, stores: await getPathaoStores() }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "cities") {
      return NextResponse.json({ success: true, cities: await getPathaoCities() }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "zones" || action === "areas") {
      const rawId = params.get(action === "zones" ? "cityId" : "zoneId") || "";
      const id = Number(rawId);
      if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id < 1) {
        return errorResponse("A valid location ID is required.", 400);
      }
      const locations = action === "zones" ? await getPathaoZones(id) : await getPathaoAreas(id);
      return NextResponse.json({ success: true, locations }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "shipments") {
      const admin = await createRuntimeServiceClient();
      const { data: shipments, error } = await admin
        .from("orders")
        .select("id, order_number, customer_name, customer_phone, shipping_city, total, delivery_status, delivery_consignment_id, delivery_tracking_code, delivery_booked_at, created_at")
        .eq("delivery_provider", "pathao")
        .not("delivery_consignment_id", "is", null)
        .order("delivery_booked_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("Pathao shipment history query failed:", error.message);
        return errorResponse("Could not load Pathao shipment history.", 503);
      }
      return NextResponse.json({ success: true, shipments: shipments ?? [] }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (action === "track") {
      const consignmentId = params.get("consignmentId") || "";
      if (!/^[A-Za-z0-9-]{3,80}$/.test(consignmentId)) {
        return errorResponse("Provide a valid Pathao Consignment ID.", 400);
      }
      const tracking = await getPathaoOrderInfo(consignmentId);
      const trackingRecord = tracking && typeof tracking === "object"
        ? tracking as { data?: { order_status?: unknown; order_status_slug?: unknown }; order_status?: unknown; order_status_slug?: unknown }
        : {};
      const providerStatus = String(
        trackingRecord.data?.order_status_slug ??
        trackingRecord.data?.order_status ??
        trackingRecord.order_status_slug ??
        trackingRecord.order_status ??
        ""
      ).toLowerCase();
      const isSpecialOperation =
        providerStatus.includes("partial") ||
        providerStatus.includes("exchange") ||
        providerStatus.includes("returnidcreated") ||
        providerStatus.includes("returnintransit") ||
        providerStatus.includes("onhold");
      const deliveryStatus = isSpecialOperation
        ? null
        : providerStatus === "delivered" || providerStatus === "orderdelivered"
          ? "delivered"
          : providerStatus === "returned" || providerStatus === "orderreturned" ||
              providerStatus === "returnedtomerchant" || providerStatus === "orderreturnedtomerchant"
            ? "returned"
            : providerStatus.includes("pick")
              ? "picked_up"
              : providerStatus.includes("transit") || providerStatus.includes("sortinghub") ||
                  providerStatus.includes("lastmilehub") || providerStatus.includes("assignedfordelivery")
                ? "in_transit"
                : providerStatus.includes("cancel")
                  ? "cancelled"
                  : null;
      let synced = false;
      if (deliveryStatus) {
        const admin = await createRuntimeServiceClient();
        const { data: syncResult, error: syncError } = await admin.rpc(
          "apply_pathao_delivery_status",
          { p_consignment_id: consignmentId, p_new_status: deliveryStatus },
        );
        if (syncError) {
          console.error("Pathao tracking sync failed:", syncError.message);
        } else {
          const result = syncResult as {
            updated?: boolean;
            unchanged?: boolean;
          } | null;
          synced = result?.updated === true || result?.unchanged === true;
        }
      }
      return NextResponse.json({ success: true, tracking, deliveryStatus, synced }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return errorResponse("Unknown Pathao action.", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pathao connection failed.";
    console.error("Pathao admin GET failed:", message);
    const status = message.includes("not configured") ? 503 : 502;
    return errorResponse(message, status);
  }
}

export async function POST(request: Request) {
  const staff = await authorizeAdmin();
  if ("error" in staff) return errorResponse(staff.error, staff.status);

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_048_576) {
      return errorResponse("Request is too large. Settlement imports are limited to 1 MB.", 413);
    }
    body = JSON.parse(raw);
  } catch {
    return errorResponse("Provide valid JSON data.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Provide valid data.", 400);
  }

  const input = body as Record<string, unknown>;


  if (input.action === "sync_area_catalog") {
    const admin = await createRuntimeServiceClient();
    const { data: mappings, error: mappingsError } = await admin
      .from("pathao_location_mappings")
      .select("pathao_city_id, pathao_zone_id")
      .eq("is_active", true)
      .eq("is_verified", true)
      .limit(1000);
    if (mappingsError) {
      console.error("Pathao area sync mapping lookup failed:", mappingsError.message);
      return errorResponse("Could not load verified Pathao City/Zone mappings.", 503);
    }

    const cityByZone = new Map<number, number>();
    for (const mapping of mappings ?? []) {
      const cityId = Number(mapping.pathao_city_id);
      const zoneId = Number(mapping.pathao_zone_id);
      if (Number.isSafeInteger(cityId) && cityId > 0 && Number.isSafeInteger(zoneId) && zoneId > 0) {
        const existingCity = cityByZone.get(zoneId);
        if (existingCity !== undefined && existingCity !== cityId) {
          return errorResponse("A Pathao Zone is linked to multiple Cities. Resolve the mapping conflict before syncing Areas.", 409);
        }
        cityByZone.set(zoneId, cityId);
      }
    }

    const zoneIds = [...cityByZone.keys()];
    if (zoneIds.length === 0) {
      return errorResponse("No verified Pathao City/Zone mappings exist yet. Sync district coverage first.", 409);
    }

    const requestedOffset = Number(input.areaOffset ?? 0);
    if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0 || requestedOffset >= zoneIds.length) {
      return errorResponse("Invalid Pathao Area sync batch offset.", 400);
    }
    const batchZoneIds = zoneIds.slice(requestedOffset, requestedOffset + 6);
    let results;
    try {
      results = await getPathaoAreasForZones(batchZoneIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pathao Area catalog request failed.";
      console.error("Pathao area catalog sync failed:", message);
      return errorResponse(message, 502);
    }

    const now = new Date().toISOString();
    const rows: Array<Record<string, unknown>> = [];
    const failedZones: Array<{ zoneId: number; error: string }> = [];
    let successfulZones = 0;
    for (const result of results) {
      if (result.error) {
        failedZones.push({ zoneId: result.zoneId, error: result.error });
        continue;
      }

      const zoneRows: Array<Record<string, unknown>> = [];
      const sourceRows = extractPathaoRows(result.payload);
      for (const row of sourceRows) {
        const rawAreaId = row.area_id ?? row.areaId ?? row.id;
        const areaId = Number(rawAreaId);
        const areaName = typeof row.area_name === "string"
          ? row.area_name.trim()
          : typeof row.areaName === "string"
            ? row.areaName.trim()
            : typeof row.name === "string"
              ? row.name.trim()
              : "";
        if (!Number.isSafeInteger(areaId) || areaId < 1 || !areaName) continue;
        const availability = typeof row.home_delivery_available === "boolean"
          ? row.home_delivery_available
          : typeof row.homeDeliveryAvailable === "boolean"
            ? row.homeDeliveryAvailable
            : null;
        zoneRows.push({
          pathao_city_id: cityByZone.get(result.zoneId),
          pathao_zone_id: result.zoneId,
          pathao_area_id: areaId,
          pathao_area_name: areaName,
          home_delivery_available: availability,
          is_active: true,
          synced_at: now,
          updated_at: now,
        });
      }

      if (zoneRows.length === 0) {
        const payloadRecord = result.payload && typeof result.payload === "object"
          ? result.payload as Record<string, unknown>
          : null;
        const apiMessage = typeof payloadRecord?.message === "string"
          ? payloadRecord.message
          : "Pathao returned no usable Area records (empty list or unexpected response shape).";
        failedZones.push({
          zoneId: result.zoneId,
          error: apiMessage.slice(0, 240),
        });
        continue;
      }

      successfulZones += 1;
      rows.push(...zoneRows);
    }

    if (successfulZones === 0) {
      return NextResponse.json({
        success: false,
        syncedZoneCount: 0,
        failedZoneCount: failedZones.length,
        failedZones,
        areaCount: 0,
        message: "Pathao returned no usable Area records for any mapped zone. Check the per-zone errors and API response format.",
      }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }

    let savedCount = 0;
    if (rows.length > 0) {
      const { data: saved, error: saveError } = await admin
        .from("pathao_area_catalog")
        .upsert(rows, { onConflict: "pathao_zone_id,pathao_area_id" })
        .select("id");
      if (saveError || !saved) {
        console.error("Pathao Area catalog save failed:", saveError?.message);
        return errorResponse("Could not save the Pathao Area catalog. Apply the area catalog migration first.", 503);
      }
      savedCount = saved.length;
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId,
      action: "pathao.area_catalog.synced",
      target_type: "pathao_area_catalog",
      details: {
        mapped_zone_count: zoneIds.length,
        processed_zone_count: batchZoneIds.length,
        batch_offset: requestedOffset,
        successful_zone_count: successfulZones,
        failed_zone_count: failedZones.length,
        saved_area_count: savedCount,
        source: "pathao_live_area_list",
      },
    });
    if (auditError) console.error("Pathao Area catalog audit log failed:", auditError.message);

    return NextResponse.json({
      success: failedZones.length === 0,
      mappedZoneCount: zoneIds.length,
      processedZoneCount: batchZoneIds.length,
      nextOffset: requestedOffset + batchZoneIds.length,
      hasMore: requestedOffset + batchZoneIds.length < zoneIds.length,
      syncedZoneCount: successfulZones,
      failedZoneCount: failedZones.length,
      failedZones,
      areaCount: savedCount,
      message: `Saved ${savedCount} Area records from ${successfulZones}/${zoneIds.length} mapped zones. ${failedZones.length} zones returned errors or no usable Area data.`,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (input.action === "auto_map_district") {
    const divisionCode = typeof input.divisionCode === "string" ? input.divisionCode.trim() : "";
    const districtCode = typeof input.districtCode === "string" ? input.districtCode.trim() : "";
    const cityId = input.pathaoCityId;
    if (
      !/^BD-D[0-9]{2}$/.test(divisionCode) ||
      !/^BD-D[0-9]{2}-Z[0-9]{2}$/.test(districtCode) ||
      !Number.isSafeInteger(cityId) || Number(cityId) < 1
    ) {
      return errorResponse("Select a valid Bangladesh division, district, and Pathao city.", 400);
    }

    const division = BANGLADESH_ADMIN_AREAS.find((item) => item.code === divisionCode);
    const district = division?.districts.find((item) => item.code === districtCode);
    if (!division || !district || district.upazilas.length === 0) {
      return errorResponse("The selected Bangladesh district was not found or has no upazilas.", 400);
    }

    const cities = extractPathaoRows(await getPathaoCities());
    const city = cities.find((row) => Number(row.city_id) === cityId);
    if (!city || typeof city.city_name !== "string") {
      return errorResponse("The selected Pathao city ID was not found in the live Pathao catalog.", 422);
    }

    const zones = extractPathaoRows(await getPathaoZones(Number(cityId)));
    const normalize = (value: string) => value.normalize("NFKD")
      .toLocaleLowerCase("en")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]/g, "");
    const zoneIndex = new Map<string, Array<{ id: number; name: string }>>();
    for (const row of zones) {
      const id = Number(row.zone_id);
      const name = typeof row.zone_name === "string" ? row.zone_name.trim() : "";
      if (!Number.isSafeInteger(id) || id < 1 || !name) continue;
      const key = normalize(name);
      zoneIndex.set(key, [...(zoneIndex.get(key) ?? []), { id, name }]);
    }

    const matches = district.upazilas.flatMap((upazila) => {
      const candidates = zoneIndex.get(normalize(upazila.name)) ?? [];
      return candidates.length === 1
        ? [{ upazila, zone: candidates[0] }]
        : [];
    });
    if (matches.length === 0) {
      return NextResponse.json({
        success: true,
        cityName: city.city_name,
        matchedCount: 0,
        skippedCount: district.upazilas.length,
        mappings: [],
        message: "No unambiguous exact-name Pathao zone matches were found. No mappings were saved.",
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const admin = await createRuntimeServiceClient();
    const now = new Date().toISOString();
    const rows = matches.map(({ upazila, zone }) => ({
      division_code: divisionCode,
      district_code: districtCode,
      upazila_code: upazila.code,
      pathao_city_id: Number(cityId),
      pathao_zone_id: zone.id,
      pathao_city_name: city.city_name as string,
      pathao_zone_name: zone.name,
      is_verified: true,
      is_active: true,
      verified_at: now,
      verified_by: staff.userId,
      updated_at: now,
    }));
    const { data: saved, error } = await admin
      .from("pathao_location_mappings")
      .upsert(rows, { onConflict: "district_code,upazila_code" })
      .select("id, division_code, district_code, upazila_code, pathao_city_id, pathao_zone_id, pathao_city_name, pathao_zone_name, is_verified, is_active, verified_at, updated_at");
    if (error || !saved) {
      console.error("Pathao automatic location mapping failed:", error?.message);
      return errorResponse("Could not save automatically matched Pathao locations.", 503);
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId,
      action: "pathao.location_mapping.auto_verified",
      target_type: "pathao_location_mapping",
      target_id: saved[0]?.id ?? null,
      details: {
        division_code: divisionCode,
        district_code: districtCode,
        pathao_city_id: Number(cityId),
        matched_count: saved.length,
        skipped_count: district.upazilas.length - saved.length,
        matching_method: "unique_exact_normalized_name",
      },
    });
    if (auditError) console.error("Pathao automatic mapping audit log failed:", auditError.message);

    return NextResponse.json({
      success: true,
      cityName: city.city_name,
      matchedCount: saved.length,
      skippedCount: district.upazilas.length - saved.length,
      mappings: saved,
      message: "Only unique exact-name matches were verified against the live Pathao city/zone catalog and saved.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }


  if (input.action === "auto_map_division") {
    const divisionCode = typeof input.divisionCode === "string" ? input.divisionCode.trim() : "";
    if (!/^BD-D[0-9]{2}$/.test(divisionCode)) {
      return errorResponse("Select a valid Bangladesh division.", 400);
    }

    const division = BANGLADESH_ADMIN_AREAS.find((item) => item.code === divisionCode);
    if (!division) return errorResponse("The selected Bangladesh division was not found.", 404);

    const normalize = (value: string) => value.normalize("NFKD")
      .toLocaleLowerCase("en")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]/g, "");
    const cityAliases: Record<string, string[]> = {
      comilla: ["cumilla"],
      chattogram: ["chittagong"],
      coxsbazar: ["cox's bazar", "coxs bazar"],
      barisal: ["barishal"],
      jashore: ["jessore"],
      bogura: ["bogra"],
      moulvibazar: ["maulvibazar"],
    };
    const cities = extractPathaoRows(await getPathaoCities());
    const cityMatches = division.districts.map((district) => {
      const districtKey = normalize(district.name);
      const aliases = new Set([districtKey, ...(cityAliases[districtKey] ?? []).map(normalize)]);
      const matches = cities.filter((row) =>
        typeof row.city_name === "string" &&
        aliases.has(normalize(row.city_name)) &&
        Number.isSafeInteger(Number(row.city_id)) &&
        Number(row.city_id) > 0
      );
      return {
        district,
        city: matches.length === 1 ? matches[0] : null,
        cityStatus: matches.length === 0 ? "city_not_found" : matches.length > 1 ? "city_ambiguous" : "matched",
      };
    });

    const uniqueCityIds = [...new Set(cityMatches.flatMap(({ city }) =>
      city ? [Number(city.city_id)] : []
    ))];
    const zoneResults = await getPathaoZonesForCities(uniqueCityIds);
    const zonesByCity = new Map(zoneResults.map((item) => [item.cityId, item]));

    const now = new Date().toISOString();
    const rows: Array<Record<string, unknown>> = [];
    const districtResults = cityMatches.map(({ district, city, cityStatus }) => {
      if (!city) {
        return {
          districtCode: district.code,
          districtName: district.name,
          status: cityStatus,
          pathaoCityName: null,
          totalUpazilas: district.upazilas.length,
          matchedUpazilas: 0,
          skippedUpazilas: district.upazilas.map((item) => item.name),
        };
      }

      const cityId = Number(city.city_id);
      const zoneResult = zonesByCity.get(cityId);
      if (!zoneResult || zoneResult.error) {
        return {
          districtCode: district.code,
          districtName: district.name,
          status: "zones_unavailable",
          pathaoCityName: String(city.city_name),
          totalUpazilas: district.upazilas.length,
          matchedUpazilas: 0,
          skippedUpazilas: district.upazilas.map((item) => item.name),
          error: zoneResult?.error ?? "Pathao returned no zone response.",
        };
      }

      const zones = extractPathaoRows(zoneResult.payload);
      const zoneIndex = new Map<string, Array<{ id: number; name: string }>>();
      for (const row of zones) {
        const id = Number(row.zone_id);
        const name = typeof row.zone_name === "string" ? row.zone_name.trim() : "";
        if (!Number.isSafeInteger(id) || id < 1 || !name) continue;
        const key = normalize(name);
        zoneIndex.set(key, [...(zoneIndex.get(key) ?? []), { id, name }]);
      }

      // Distinguish a genuinely unmatched district from a successful HTTP
      // response whose payload is empty or does not match Pathao's zone schema.
      if (zoneIndex.size === 0) {
        return {
          districtCode: district.code,
          districtName: district.name,
          status: "zones_unavailable",
          pathaoCityName: String(city.city_name),
          totalUpazilas: district.upazilas.length,
          matchedUpazilas: 0,
          skippedUpazilas: district.upazilas.map((item) => item.name),
          error: zones.length === 0
            ? "Pathao returned an empty or unrecognized zone list for this City."
            : `Pathao returned ${zones.length} zone rows, but none contained a valid zone_id and zone_name.`,
        };
      }

      const matched = district.upazilas.flatMap((upazila) => {
        const candidates = zoneIndex.get(normalize(upazila.name)) ?? [];
        return candidates.length === 1 ? [{ upazila, zone: candidates[0] }] : [];
      });

      for (const { upazila, zone } of matched) {
        rows.push({
          division_code: divisionCode,
          district_code: district.code,
          upazila_code: upazila.code,
          pathao_city_id: cityId,
          pathao_zone_id: zone.id,
          pathao_city_name: String(city.city_name),
          pathao_zone_name: zone.name,
          is_verified: true,
          is_active: true,
          verified_at: now,
          verified_by: staff.userId,
          updated_at: now,
        });
      }

      return {
        districtCode: district.code,
        districtName: district.name,
        status: matched.length === district.upazilas.length ? "fully_mapped" : matched.length > 0 ? "partially_mapped" : "no_exact_zone_match",
        pathaoCityName: String(city.city_name),
        totalUpazilas: district.upazilas.length,
        matchedUpazilas: matched.length,
        skippedUpazilas: district.upazilas
          .filter((upazila) => !matched.some((item) => item.upazila.code === upazila.code))
          .map((item) => item.name),
      };
    });

    let savedCount = 0;
    if (rows.length > 0) {
      const admin = await createRuntimeServiceClient();
      const { data: saved, error } = await admin
        .from("pathao_location_mappings")
        .upsert(rows, { onConflict: "district_code,upazila_code" })
        .select("id");
      if (error || !saved) {
        console.error("Pathao division coverage sync failed:", error?.message);
        return errorResponse("Could not save exact Pathao location matches for this division.", 503);
      }
      savedCount = saved.length;

      const { error: auditError } = await admin.from("audit_logs").insert({
        actor_id: staff.userId,
        action: "pathao.location_mapping.division_synced",
        target_type: "pathao_location_mapping",
        details: {
          division_code: divisionCode,
          district_count: districtResults.length,
          matched_upazila_count: savedCount,
          skipped_upazila_count: districtResults.reduce((sum, item) => sum + item.skippedUpazilas.length, 0),
          matching_method: "unique_exact_normalized_city_and_zone_name",
        },
      });
      if (auditError) console.error("Pathao division sync audit log failed:", auditError.message);
    }

    return NextResponse.json({
      success: true,
      divisionCode,
      divisionName: division.name,
      districtCount: districtResults.length,
      matchedUpazilaCount: savedCount,
      skippedUpazilaCount: districtResults.reduce((sum, item) => sum + item.skippedUpazilas.length, 0),
      districts: districtResults,
      message: "Only unique exact Pathao city and zone name matches were saved. Missing or ambiguous locations were left unmapped for manual review.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (input.action === "save_location_mapping") {
    const divisionCode = typeof input.divisionCode === "string" ? input.divisionCode.trim() : "";
    const districtCode = typeof input.districtCode === "string" ? input.districtCode.trim() : "";
    const upazilaCode = typeof input.upazilaCode === "string" ? input.upazilaCode.trim() : "";
    const cityId = input.pathaoCityId;
    const zoneId = input.pathaoZoneId;
    if (
      !/^BD-D[0-9]{2}$/.test(divisionCode) ||
      !/^BD-D[0-9]{2}-Z[0-9]{2}$/.test(districtCode) ||
      !/^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$/.test(upazilaCode) ||
      !Number.isSafeInteger(cityId) || Number(cityId) < 1 ||
      !Number.isSafeInteger(zoneId) || Number(zoneId) < 1
    ) {
      return errorResponse("Select a valid Bangladesh division, district, upazila, Pathao city, and Pathao zone.", 400);
    }

    const address = resolveBangladeshAddress(divisionCode, districtCode, upazilaCode, "not_applicable");
    if (!address || !address.upazila || address.division.code !== divisionCode ||
        address.district.code !== districtCode || address.upazila.code !== upazilaCode) {
      return errorResponse("The Bangladesh administrative codes do not form a valid address.", 400);
    }

    // Verify both IDs and their names against Pathao's live catalog before
    // persisting a mapping. Client-supplied labels are never trusted.
    const cities = extractPathaoRows(await getPathaoCities());
    const city = cities.find((row) => Number(row.city_id) === cityId);
    if (!city || typeof city.city_name !== "string") {
      return errorResponse("The selected Pathao city ID was not found in the live Pathao catalog.", 422);
    }
    const zones = extractPathaoRows(await getPathaoZones(Number(cityId)));
    const zone = zones.find((row) => Number(row.zone_id) === zoneId);
    if (!zone || typeof zone.zone_name !== "string") {
      return errorResponse("The selected Pathao zone does not belong to the selected Pathao city.", 422);
    }

    const admin = await createRuntimeServiceClient();
    const now = new Date().toISOString();
    const { data: mapping, error } = await admin
      .from("pathao_location_mappings")
      .upsert({
        division_code: divisionCode,
        district_code: districtCode,
        upazila_code: upazilaCode,
        pathao_city_id: Number(cityId),
        pathao_zone_id: Number(zoneId),
        pathao_city_name: city.city_name,
        pathao_zone_name: zone.zone_name,
        is_verified: true,
        is_active: true,
        verified_at: now,
        verified_by: staff.userId,
        updated_at: now,
      }, { onConflict: "district_code,upazila_code" })
      .select("id, division_code, district_code, upazila_code, pathao_city_id, pathao_zone_id, pathao_city_name, pathao_zone_name, is_verified, is_active, verified_at, updated_at")
      .single();

    if (error || !mapping) {
      console.error("Pathao location mapping save failed:", error?.message);
      return errorResponse("Could not save the verified Pathao location mapping.", 503);
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId,
      action: "pathao.location_mapping.verified",
      target_type: "pathao_location_mapping",
      target_id: mapping.id,
      details: {
        district_code: districtCode,
        upazila_code: upazilaCode,
        pathao_city_id: Number(cityId),
        pathao_zone_id: Number(zoneId),
      },
    });
    if (auditError) console.error("Pathao location mapping audit log failed:", auditError.message);

    return NextResponse.json({ success: true, mapping }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (input.action === "record_delivery_operation") {
    const allowedTypes = ["reverse_pickup", "return", "exchange", "partial_delivery"] as const;
    const allowedStatuses = ["requested", "in_progress", "completed", "failed", "recorded"] as const;
    const consignmentId = typeof input.consignmentId === "string" ? input.consignmentId.trim() : "";
    const operationType = typeof input.operationType === "string" ? input.operationType : "";
    const operationStatus = typeof input.operationStatus === "string" ? input.operationStatus : "recorded";
    const relatedConsignmentId = typeof input.relatedConsignmentId === "string"
      ? input.relatedConsignmentId.trim()
      : "";
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (
      !/^[A-Za-z0-9-]{3,80}$/.test(consignmentId) ||
      !allowedTypes.includes(operationType as typeof allowedTypes[number]) ||
      !allowedStatuses.includes(operationStatus as typeof allowedStatuses[number]) ||
      (relatedConsignmentId !== "" && !/^[A-Za-z0-9-]{3,80}$/.test(relatedConsignmentId)) ||
      notes.length > 1000
    ) {
      return errorResponse("Pathao operation details are invalid.", 400);
    }
    const admin = await createRuntimeServiceClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, order_number")
      .eq("delivery_provider", "pathao")
      .eq("delivery_consignment_id", consignmentId)
      .maybeSingle();
    if (orderError || !order) {
      return errorResponse("No NEWEIX Pathao order was found for this consignment ID.", 404);
    }
    const { data: operation, error: insertError } = await admin
      .from("pathao_delivery_operations")
      .insert({
        order_id: order.id,
        consignment_id: consignmentId,
        operation_type: operationType,
        operation_status: operationStatus,
        related_consignment_id: relatedConsignmentId || null,
        notes: notes || null,
        created_by: staff.userId,
      })
      .select("id, consignment_id, operation_type, operation_status, related_consignment_id, notes, created_at")
      .single();
    if (insertError || !operation) {
      console.error("Pathao delivery operation insert failed:", insertError?.message);
      return errorResponse("Could not record Pathao operation.", 503);
    }
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId,
      action: "pathao.delivery.operation_recorded",
      target_type: "order",
      target_id: order.id,
      details: {
        order_number: order.order_number,
        consignment_id: consignmentId,
        operation_type: operationType,
        operation_status: operationStatus,
        related_consignment_id: relatedConsignmentId || null,
      },
    });
    if (auditError) console.error("Pathao operation audit log failed:", auditError.message);
    return NextResponse.json({ success: true, operation }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (input.action === "record_payout_receipt") {
    if (
      typeof input.importId !== "string" || !UUID_REGEX.test(input.importId) ||
      typeof input.actualReceivedAmount !== "number" || !Number.isFinite(input.actualReceivedAmount) ||
      input.actualReceivedAmount < 0 || input.actualReceivedAmount > 100000000 ||
      typeof input.receiptReference !== "string" ||
      input.receiptReference.trim().length < 3 || input.receiptReference.trim().length > 120
    ) {
      return errorResponse("Provide a valid report, received amount, and bank/MFS transaction reference.", 400);
    }
    const admin = await createRuntimeServiceClient();
    const { data: report, error: reportError } = await admin
      .from("pathao_settlement_imports")
      .select("id, expected_payout_amount, actual_received_amount")
      .eq("id", input.importId)
      .maybeSingle();
    if (reportError || !report) return errorResponse("Settlement report was not found.", 404);
    if (report.expected_payout_amount == null) {
      return errorResponse("This report has no complete Net Payout column. Import a report with Net Payout values before recording receipt reconciliation.", 409);
    }
    if (report.actual_received_amount != null) {
      return errorResponse("A receipt has already been recorded for this report. A second receipt requires a separate report or a reviewed adjustment process.", 409);
    }
    const expected = Number(report.expected_payout_amount);
    const actual = Math.round(input.actualReceivedAmount * 100) / 100;
    const variance = Math.round((actual - expected) * 100) / 100;
    const reconciliationStatus = Math.abs(variance) <= 0.01 ? "reconciled" : "variance";
    const { data: updated, error: updateError } = await admin
      .from("pathao_settlement_imports")
      .update({
        actual_received_amount: actual,
        payout_variance: variance,
        receipt_reference: input.receiptReference.trim(),
        received_at: new Date().toISOString(),
        received_by: staff.userId,
        reconciliation_status: reconciliationStatus,
      })
      .eq("id", input.importId)
      .is("actual_received_amount", null)
      .select("id, expected_payout_amount, actual_received_amount, payout_variance, receipt_reference, received_at, reconciliation_status")
      .maybeSingle();
    if (updateError || !updated) {
      console.error("Pathao payout receipt save failed:", updateError?.message);
      return errorResponse("Receipt may already have been recorded. Refresh the report before retrying.", 409);
    }
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId,
      action: "pathao.settlement.receipt_recorded",
      target_type: "pathao_settlement_import",
      target_id: input.importId,
      details: {
        expected_payout_amount: expected,
        actual_received_amount: actual,
        payout_variance: variance,
        receipt_reference: input.receiptReference.trim(),
        reconciliation_status: reconciliationStatus,
      },
    });
    if (auditError) console.error("Pathao payout receipt audit log failed:", auditError.message);
    return NextResponse.json({ success: true, report: updated }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (input.action === "import_settlement") {
    if (staff.role !== "supreme" && staff.role !== "admin") {
      return errorResponse("Only Supreme/Admin can import Pathao settlement reports.", 403);
    }
    if (
      typeof input.sourceFilename !== "string" ||
      input.sourceFilename.trim().length < 1 ||
      input.sourceFilename.trim().length > 255 ||
      (input.settlementReference != null &&
        (typeof input.settlementReference !== "string" || input.settlementReference.trim().length > 120)) ||
      (input.settlementDate != null &&
        (typeof input.settlementDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.settlementDate))) ||
      !Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 1000
    ) {
      return errorResponse("Settlement report details are invalid. Import 1 to 1,000 mapped rows.", 400);
    }

    const parsedRows: Array<{
      source_row_number: number;
      source_identifier: string;
      cod_amount: number;
      delivery_charge: number | null;
      discount_amount: number | null;
      net_payout_amount: number | null;
      raw_row: Record<string, string>;
    }> = [];
    for (let index = 0; index < input.rows.length; index += 1) {
      const value = input.rows[index];
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return errorResponse(`Settlement row ${index + 1} is invalid.`, 400);
      }
      const row = value as Record<string, unknown>;
      const identifier = typeof row.identifier === "string" ? row.identifier.trim() : "";
      const parseAmount = (candidate: unknown): number | null => {
        if (candidate == null || candidate === "") return null;
        if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0 || candidate > 100000000) return null;
        return Math.round(candidate * 100) / 100;
      };
      const codAmount = parseAmount(row.codAmount);
      const deliveryCharge = parseAmount(row.deliveryCharge);
      const discountAmount = parseAmount(row.discountAmount);
      const netPayoutAmount = parseAmount(row.netPayoutAmount);
      if (!identifier || identifier.length > 120 || codAmount === null ||
          (row.deliveryCharge != null && row.deliveryCharge !== "" && deliveryCharge === null) ||
          (row.discountAmount != null && row.discountAmount !== "" && discountAmount === null) ||
          (row.netPayoutAmount != null && row.netPayoutAmount !== "" && netPayoutAmount === null)) {
        return errorResponse(`Settlement row ${index + 1} has an invalid identifier or amount.`, 400);
      }
      parsedRows.push({
        source_row_number: index + 1,
        source_identifier: identifier,
        cod_amount: codAmount,
        delivery_charge: deliveryCharge,
        discount_amount: discountAmount,
        net_payout_amount: netPayoutAmount,
        raw_row: {},
      });
    }

    const reference = typeof input.settlementReference === "string" && input.settlementReference.trim()
      ? input.settlementReference.trim()
      : null;
    const settlementDate = typeof input.settlementDate === "string" ? input.settlementDate : null;
    const admin = await createRuntimeServiceClient();
    if (reference) {
      const { data: existing } = await admin
        .from("pathao_settlement_imports")
        .select("id")
        .eq("settlement_reference", reference)
        .maybeSingle();
      if (existing) return errorResponse("This Pathao settlement reference has already been imported.", 409);
    }

    const identifiers = [...new Set(parsedRows.map((row) => row.source_identifier))];
    const byConsignment: Array<{
      id: string; order_number: string; delivery_consignment_id: string | null;
      total: number | string; delivery_fee: number | string;
      delivery_fee_payment_status: string | null; payment_method: string;
    }> = [];
    const byOrderNumber: typeof byConsignment = [];
    for (let offset = 0; offset < identifiers.length; offset += 100) {
      const batch = identifiers.slice(offset, offset + 100);
      const { data: consignmentRows, error: consignmentError } = await admin
        .from("orders")
        .select("id, order_number, delivery_consignment_id, total, delivery_fee, delivery_fee_payment_status, payment_method")
        .eq("delivery_provider", "pathao")
        .in("delivery_consignment_id", batch);
      if (consignmentError) {
        console.error("Pathao settlement consignment matching failed:", consignmentError.message);
        return errorResponse("Could not match Pathao consignments to NEWEIX orders.", 503);
      }
      byConsignment.push(...(consignmentRows ?? []));
      const { data: orderRows, error: orderNumberError } = await admin
        .from("orders")
        .select("id, order_number, delivery_consignment_id, total, delivery_fee, delivery_fee_payment_status, payment_method")
        .eq("delivery_provider", "pathao")
        .in("order_number", batch);
      if (orderNumberError) {
        console.error("Pathao settlement order matching failed:", orderNumberError.message);
        return errorResponse("Could not match Pathao order numbers to NEWEIX orders.", 503);
      }
      byOrderNumber.push(...(orderRows ?? []));
    }
    const orderMap = new Map<string, {
      id: string; order_number: string; delivery_consignment_id: string | null;
      total: number | string; delivery_fee: number | string;
      delivery_fee_payment_status: string | null; payment_method: string;
    }>();
    for (const order of [...(byOrderNumber ?? []), ...(byConsignment ?? [])]) {
      if (order.delivery_consignment_id) orderMap.set(order.delivery_consignment_id, order);
      orderMap.set(order.order_number, order);
    }

    const seen = new Set<string>();
    const rowsToInsert = parsedRows.map((row) => {
      if (seen.has(row.source_identifier)) {
        return {
          ...row, consignment_id: null, merchant_order_id: null, expected_cod_amount: null,
          variance_amount: null, matched_order_id: null, match_status: "duplicate" as const,
        };
      }
      seen.add(row.source_identifier);
      const order = orderMap.get(row.source_identifier);
      if (!order) {
        return {
          ...row, consignment_id: null, merchant_order_id: null, expected_cod_amount: null,
          variance_amount: null, matched_order_id: null, match_status: "unmatched" as const,
        };
      }
      const expected = order.payment_method === "cod"
        ? Math.max(0, Number(order.total) -
          (order.delivery_fee_payment_status === "paid" ? Number(order.delivery_fee) : 0))
        : 0;
      const variance = Math.round((row.cod_amount - expected) * 100) / 100;
      return {
        ...row,
        consignment_id: order.delivery_consignment_id,
        merchant_order_id: order.order_number,
        expected_cod_amount: Math.round(expected * 100) / 100,
        variance_amount: variance,
        matched_order_id: order.id,
        match_status: Math.abs(variance) <= 0.01 ? "matched" as const : "amount_mismatch" as const,
      };
    });

    const allRowsHavePayout = rowsToInsert.every((row) => row.net_payout_amount !== null);
    const expectedPayoutAmount = allRowsHavePayout
      ? Math.round(rowsToInsert
          .filter((row) => row.match_status !== "duplicate")
          .reduce((sum, row) => sum + Number(row.net_payout_amount), 0) * 100) / 100
      : null;
    const matchedCount = rowsToInsert.filter((row) => row.match_status === "matched").length;
    const mismatchCount = rowsToInsert.filter((row) => row.match_status === "amount_mismatch").length;
    const unmatchedCount = rowsToInsert.filter((row) => row.match_status === "unmatched" || row.match_status === "duplicate").length;
    const { data: importRecord, error: importError } = await admin
      .from("pathao_settlement_imports")
      .insert({
        settlement_reference: reference,
        settlement_date: settlementDate,
        source_filename: input.sourceFilename.trim(),
        imported_by: staff.userId,
        row_count: rowsToInsert.length,
        matched_count: matchedCount,
        mismatch_count: mismatchCount,
        unmatched_count: unmatchedCount,
        expected_payout_amount: expectedPayoutAmount,
        notes: typeof input.notes === "string" ? input.notes.trim().slice(0, 1000) : null,
      })
      .select("id")
      .single();
    if (importError || !importRecord) {
      if (importError?.code === "23505") return errorResponse("This settlement reference has already been imported.", 409);
      console.error("Pathao settlement import header insert failed:", importError?.message);
      return errorResponse("Could not save Pathao settlement import.", 503);
    }

    const { error: rowsError } = await admin
      .from("pathao_settlement_rows")
      .insert(rowsToInsert.map((row) => ({ ...row, import_id: importRecord.id })));
    if (rowsError) {
      await admin.from("pathao_settlement_imports").delete().eq("id", importRecord.id);
      console.error("Pathao settlement rows insert failed:", rowsError.message);
      return errorResponse("Could not save settlement rows. No import was retained.", 503);
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId,
      action: "pathao.settlement.imported",
      target_type: "pathao_settlement_import",
      target_id: importRecord.id,
      details: {
        source_filename: input.sourceFilename.trim(),
        settlement_reference: reference,
        row_count: rowsToInsert.length,
        matched_count: matchedCount,
        mismatch_count: mismatchCount,
        unmatched_count: unmatchedCount,
      },
    });
    if (auditError) console.error("Pathao settlement audit log failed:", auditError.message);

    return NextResponse.json({
      success: true,
      importId: importRecord.id,
      rowCount: rowsToInsert.length,
      matchedCount,
      mismatchCount,
      unmatchedCount,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (input.action === "calculate_price") {
    const storeId = Number(input.storeId);
    const itemWeightKg = Number(input.itemWeightKg);
    const itemType = Number(input.itemType ?? 2);
    const deliveryType = Number(input.deliveryType ?? 48);
    const recipientCity = input.recipientCity == null ? undefined : Number(input.recipientCity);
    const recipientZone = input.recipientZone == null ? undefined : Number(input.recipientZone);
    if (!Number.isSafeInteger(storeId) || storeId < 1 ||
        ![1, 2].includes(itemType) || ![12, 48].includes(deliveryType) ||
        !Number.isFinite(itemWeightKg) || itemWeightKg <= 0 || itemWeightKg > 10 ||
        (recipientCity !== undefined && (!Number.isSafeInteger(recipientCity) || recipientCity < 1)) ||
        (recipientZone !== undefined && (!Number.isSafeInteger(recipientZone) || recipientZone < 1))) {
      return errorResponse("Invalid Pathao price calculation details.", 400);
    }
    try {
      const quote = await calculatePathaoPrice({
        storeId, itemType, deliveryType, itemWeightKg, recipientCity, recipientZone,
      });
      return NextResponse.json({ success: true, quote }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pathao price calculation failed.";
      console.error("Pathao price calculation failed:", message);
      return errorResponse("Pathao could not calculate this delivery price. Verify store, city, zone and parcel details.", 502);
    }
  }

  if (input.action !== "create_order" ||
      typeof input.orderId !== "string" ||
      !UUID_REGEX.test(input.orderId) ||
      typeof input.storeId !== "number" ||
      !Number.isSafeInteger(input.storeId) ||
      input.storeId < 1 ||
      (input.specialInstruction != null &&
        (typeof input.specialInstruction !== "string" || input.specialInstruction.length > 500)) ||
      (input.recipientAddress != null &&
        (typeof input.recipientAddress !== "string" || input.recipientAddress.trim().length < 10 || input.recipientAddress.trim().length > 220))) {
    return errorResponse("Order, Store ID, or instructions are invalid.", 400);
  }

  const orderId = input.orderId;
  const storeId = input.storeId;
  const specialInstruction = typeof input.specialInstruction === "string"
    ? input.specialInstruction.trim()
    : "";
  const recipientAddressOverride = typeof input.recipientAddress === "string"
    ? input.recipientAddress.trim()
    : "";

  const admin = await createRuntimeServiceClient();
  const { data: reserved, error: reserveError } = await admin.rpc(
    "reserve_pathao_order_booking",
    { p_order_id: orderId, p_actor_id: staff.userId }
  );

  if (reserveError || !reserved) {
    const message = reserveError?.message || "Pathao booking reservation failed.";
    const knownConflicts = [
      "ORDER_NOT_FOUND", "PATHAO_ALREADY_BOOKED", "PATHAO_BOOKING_IN_PROGRESS",
      "ORDER_NOT_READY_FOR_SHIPPING", "ORDER_PAYMENT_NOT_VERIFIED",
      "COD_DELIVERY_FEE_NOT_VERIFIED", "PATHAO_ORDER_STATE_INVALID",
    ];
    const conflict = knownConflicts.some((code) => message.includes(code));
    return errorResponse(
      conflict
        ? "This order cannot be sent to Pathao yet. Check payment, order status, or an existing booking."
        : "Could not start the Pathao booking.",
      conflict ? 409 : 503
    );
  }

  const order = reserved as {
    id: string;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    shipping_address: string;
    shipping_city: string | null;
    shipping_division: string | null;
    shipping_district: string | null;
    shipping_upazila: string | null;
    shipping_union: string | null;
    shipping_union_other: string | null;
    shipping_village: string | null;
    total: number | string;
    delivery_fee: number | string;
    payment_method: string;
    payment_status: string;
    delivery_fee_payment_status: string;
  };

  const recipientName = order.customer_name.trim();
  if (recipientName.length < 3 || recipientName.length > 100) {
    await admin.from("orders").update({
      delivery_status: "failed",
      delivery_error: "Customer name must be between 3 and 100 characters for Pathao.",
    }).eq("id", orderId).eq("delivery_status", "booking");
    return errorResponse("Customer name for Pathao must be between 3 and 100 characters.", 400);
  }

  const recipientPhone = normalizePathaoPhone(order.customer_phone);
  if (!recipientPhone) {
    await admin.from("orders").update({
      delivery_status: "failed",
      delivery_error: "Customer phone number is not a valid Bangladesh mobile number.",
    }).eq("id", orderId).eq("delivery_status", "booking");
    return errorResponse("Customer phone number is not a valid Bangladesh mobile number for Pathao.", 400);
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("product_id, product_name, quantity")
    .eq("order_id", orderId);

  if (itemsError || !items?.length) {
    await admin.from("orders").update({
      delivery_status: "failed",
      delivery_error: "Order items could not be loaded.",
    }).eq("id", orderId).eq("delivery_status", "booking");
    return errorResponse("Order items could not be found.", 503);
  }

  const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))];
  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, weight_grams")
    .in("id", productIds);

  if (productsError) {
    await admin.from("orders").update({
      delivery_status: "failed",
      delivery_error: "Product weight lookup failed.",
    }).eq("id", orderId).eq("delivery_status", "booking");
    return errorResponse("Could not verify product weight.", 503);
  }

  const weightById = new Map((products ?? []).map((product) => [
    product.id,
    Number(product.weight_grams) || 500,
  ]));
  const itemQuantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const weightGrams = items.reduce((sum, item) =>
    sum + (weightById.get(item.product_id) ?? 500) * Number(item.quantity), 0);
  const itemWeightKg = Math.min(10, Math.max(0.5, weightGrams / 1000));

  if (weightGrams > 10_000) {
    await admin.from("orders").update({
      delivery_status: "failed",
      delivery_error: "Parcel weight exceeds Pathao's 10 kg API limit.",
    }).eq("id", orderId).eq("delivery_status", "booking");
    return errorResponse("Pathao API supports parcels up to 10 kg.", 400);
  }

  const amountToCollect = order.payment_method === "cod"
    ? Math.max(0, Number(order.total) -
      (order.delivery_fee_payment_status === "paid" ? Number(order.delivery_fee) : 0))
    : 0;

  const addressParts = recipientAddressOverride
    ? [recipientAddressOverride]
    : [
        order.shipping_address,
        order.shipping_village,
        order.shipping_union_other || order.shipping_union,
        order.shipping_upazila,
        order.shipping_district || order.shipping_city,
        order.shipping_division,
      ];
  const seenAddressParts = new Set<string>();
  const address = addressParts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value) => {
      const normalized = value.toLocaleLowerCase("en");
      if (seenAddressParts.has(normalized)) return false;
      seenAddressParts.add(normalized);
      return true;
    })
    .join(", ");
  if (address.length < 10 || address.length > 220) {
    await admin.from("orders").update({
      delivery_status: "failed",
      delivery_error: "Full Pathao address must be between 10 and 220 characters.",
    }).eq("id", orderId).eq("delivery_status", "booking");
    return errorResponse("Provide a complete Pathao address between 10 and 220 characters, including street/area, police station/upazila, and district.", 400);
  }
  const itemDescription = items
    .map((item) => `${item.product_name} × ${item.quantity}`)
    .join(", ")
    .slice(0, 200);

  try {
    const result = await createPathaoOrder({
      storeId,
      merchantOrderId: order.order_number,
      recipientName,
      recipientPhone,
      recipientAddress: address,
      itemQuantity: itemQuantity,
      itemWeightKg,
      amountToCollect: Math.round(amountToCollect),
      itemDescription,
      specialInstruction,
    });

    const { error: saveError } = await admin.from("orders").update({
      delivery_provider: "pathao",
      delivery_status: "booked",
      delivery_consignment_id: result.consignment_id,
      delivery_tracking_code: result.consignment_id,
      delivery_booked_at: new Date().toISOString(),
      delivery_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("delivery_status", "booking");

    if (saveError) {
      console.error("Pathao consignment created but local save failed:", saveError.message);
      return errorResponse(
        `Booking was created in Pathao (Consignment ID: ${result.consignment_id}), but could not be saved in NEWEIX. Look it up in the Pathao panel using this ID.`,
        503
      );
    }

    return NextResponse.json({
      success: true,
      consignmentId: result.consignment_id,
      orderStatus: result.order_status ?? null,
      deliveryFee: result.delivery_fee ?? null,
      message: "Pathao consignment created successfully.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pathao booking failed.";
    const uncertain = error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    if (!uncertain) {
      await admin.from("orders").update({
        delivery_status: "failed",
        delivery_error: message.slice(0, 1000),
      }).eq("id", orderId).eq("delivery_status", "booking");
    } else {
      await admin.from("orders").update({
        delivery_error: "Pathao request timed out; booking outcome is unknown. Check Pathao merchant panel before retrying.",
      }).eq("id", orderId).eq("delivery_status", "booking");
    }
    console.error("Pathao order booking failed:", message);
    return errorResponse(
      uncertain
        ? "Pathao did not respond; booking status is unknown. Check the Pathao Merchant Panel before submitting the same order again."
        : "Pathao booking failed. Verify the information and Pathao connection.",
      uncertain ? 504 : 502
    );
  }
}
