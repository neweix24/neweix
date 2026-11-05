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
    if (new TextEncoder().encode(raw).byteLength > 8192) {
      return errorResponse("Request is too large.", 413);
    }
    body = JSON.parse(raw);
  } catch {
    return errorResponse("Provide valid JSON data.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Provide valid data.", 400);
  }

  const input = body as Record<string, unknown>;
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
