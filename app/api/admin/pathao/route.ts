import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";
import {
  createPathaoOrder,
  getPathaoCities,
  getPathaoConfig,
  getPathaoOrderInfo,
  getPathaoStores,
  testPathaoConnection,
} from "@/lib/pathao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizeAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (authError || typeof userId !== "string") {
    return { error: "লগইন প্রয়োজন।", status: 401 as const };
  }

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true ||
      !["supreme", "admin"].includes(profile.role)) {
    return { error: "এই কাজের অনুমতি নেই।", status: 403 as const };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance.currentLevel !== "aal2") {
      return { error: "Supreme অ্যাকাউন্টে MFA সম্পন্ন করুন।", status: 403 as const };
    }
  }

  return { userId, role: profile.role };
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
  if ("error" in staff) return errorResponse(staff.error, staff.status);

  const params = new URL(request.url).searchParams;
  const action = params.get("action") || "status";

  try {
    if (action === "status") {
      const connection = await testPathaoConnection();
      return NextResponse.json({
        connected: true,
        environment: connection.environment,
        message: "Pathao authentication সফল হয়েছে।",
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

    if (action === "track") {
      const consignmentId = params.get("consignmentId") || "";
      if (!/^[A-Za-z0-9-]{3,80}$/.test(consignmentId)) {
        return errorResponse("সঠিক Pathao Consignment ID দিন।", 400);
      }
      const tracking = await getPathaoOrderInfo(consignmentId);
      return NextResponse.json({ success: true, tracking }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return errorResponse("অজানা Pathao action।", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pathao সংযোগ ব্যর্থ।";
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
      return errorResponse("অনুরোধটি অতিরিক্ত বড়।", 413);
    }
    body = JSON.parse(raw);
  } catch {
    return errorResponse("সঠিক JSON তথ্য পাঠান।", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("সঠিক তথ্য পাঠান।", 400);
  }

  const input = body as Record<string, unknown>;
  if (input.action !== "create_order" ||
      typeof input.orderId !== "string" ||
      !UUID_REGEX.test(input.orderId) ||
      typeof input.storeId !== "number" ||
      !Number.isSafeInteger(input.storeId) ||
      input.storeId < 1 ||
      (input.specialInstruction != null &&
        (typeof input.specialInstruction !== "string" || input.specialInstruction.length > 500))) {
    return errorResponse("অর্ডার, Store ID অথবা নির্দেশনা সঠিক নয়।", 400);
  }

  const orderId = input.orderId;
  const storeId = input.storeId;
  const specialInstruction = typeof input.specialInstruction === "string"
    ? input.specialInstruction.trim()
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
        ? "এই অর্ডারটি এখন Pathao-তে পাঠানো যাবে। পেমেন্ট, অর্ডার Status অথবা আগের বুকিং যাচাই করুন।"
        : "Pathao বুকিং শুরু করা যায়নি।",
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

  const recipientPhone = normalizePathaoPhone(order.customer_phone);
  if (!recipientPhone) {
    await admin.from("orders").update({
      delivery_status: "failed",
      delivery_error: "Customer phone number is not a valid Bangladesh mobile number.",
    }).eq("id", orderId).eq("delivery_status", "booking");
    return errorResponse("গ্রাহকের ফোন নম্বরটি Pathao-এর জন্য সঠিক বাংলাদেশি মোবাইল নম্বর নয়।", 400);
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
    return errorResponse("অর্ডারের পণ্যতালিকা পাওয়া যায়নি।", 503);
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
    return errorResponse("পণ্যের ওজন যাচাই করা যায়নি।", 503);
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
    return errorResponse("Pathao API-তে সর্বোচ্চ ১০ কেজি ওজনের পার্সেল পাঠানো যাবে।", 400);
  }

  const amountToCollect = order.payment_method === "cod"
    ? Math.max(0, Number(order.total) -
      (order.delivery_fee_payment_status === "paid" ? Number(order.delivery_fee) : 0))
    : 0;

  const address = [order.shipping_address, order.shipping_city]
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const itemDescription = items
    .map((item) => `${item.product_name} × ${item.quantity}`)
    .join(", ")
    .slice(0, 200);

  try {
    const result = await createPathaoOrder({
      storeId,
      merchantOrderId: order.order_number,
      recipientName: order.customer_name,
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
        `Pathao-তে বুকিং হয়েছে (Consignment ID: ${result.consignment_id}), কিন্তু NEWEIX-এ সংরক্ষণ হয়নি। এই ID দিয়ে Pathao panel-এ খুঁজে নিন।`,
        503
      );
    }

    return NextResponse.json({
      success: true,
      consignmentId: result.consignment_id,
      orderStatus: result.order_status ?? null,
      deliveryFee: result.delivery_fee ?? null,
      message: "Pathao consignment সফলভাবে তৈরি হয়েছে।",
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
        ? "Pathao উত্তর দেয়নি; বুকিং হয়েছে কি না নিশ্চিত নয়। একই অর্ডার আবার পাঠানোর আগে Pathao Merchant Panel-এ যাচাই করুন।"
        : "Pathao বুকিং ব্যর্থ হয়েছে। তথ্য ও Pathao সংযোগ যাচাই করুন।",
      uncertain ? 504 : 502
    );
  }
}
