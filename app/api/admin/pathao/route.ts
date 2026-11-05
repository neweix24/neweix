import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";
import {
  calculatePathaoPrice,
  createPathaoOrder,
  getPathaoAreas,
  getPathaoCities,
  getPathaoZones,
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

    if (action === "settlement_imports") {
      const admin = await createRuntimeServiceClient();
      const { data: imports, error: importsError } = await admin
        .from("pathao_settlement_imports")
        .select("id, settlement_reference, settlement_date, source_filename, row_count, matched_count, mismatch_count, unmatched_count, imported_at, notes")
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
      const deliveryStatus = providerStatus.includes("deliver")
        ? "delivered"
        : providerStatus.includes("pick")
          ? "picked_up"
          : providerStatus.includes("transit") || providerStatus.includes("in transit")
            ? "in_transit"
            : providerStatus.includes("return")
              ? "returned"
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
      const parseAmount = (candidate: unknown, required: boolean): number | null => {
        if (candidate == null || candidate === "") return required ? null : null;
        if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0 || candidate > 100000000) return null;
        return Math.round(candidate * 100) / 100;
      };
      const codAmount = parseAmount(row.codAmount, true);
      const deliveryCharge = parseAmount(row.deliveryCharge, false);
      const discountAmount = parseAmount(row.discountAmount, false);
      const netPayoutAmount = parseAmount(row.netPayoutAmount, false);
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

    const matchedCount = rowsToInsert.filter((row) => row.matched_order_id !== null).length;
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

  const address = recipientAddressOverride || [order.shipping_address, order.shipping_city]
    .filter((value): value is string => Boolean(value))
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
