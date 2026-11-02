import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getStaffContext() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: userError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (userError || typeof userId !== "string") {
    return { error: "Authentication required.", status: 401 as const };
  }

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    error ||
    !profile ||
    profile.is_active !== true ||
    !["supreme", "admin"].includes(profile.role)
  ) {
    return { error: "You are not authorized to perform this action.", status: 403 as const };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (assuranceError || assurance.currentLevel !== "aal2") {
      return { error: "Complete MFA for the Supreme account.", status: 403 as const };
    }
  }

  return { user: { id: userId }, role: profile.role, supabase };
}

async function getAdminClient() {
  const context = await getCloudflareContext();
  const env = context.env as Record<string, string | undefined>;

  const url =
    env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  try {
    const staff = await getStaffContext();
    if ("error" in staff) {
      return NextResponse.json(
        { error: staff.error },
        { status: staff.status }
      );
    }

    const admin = await getAdminClient();
    const orderColumns: string = staff.role === "supreme"
      ? `
        id, order_number, customer_name, customer_phone, phone, address,
        shipping_address, shipping_city, shipping_division_code, shipping_division, shipping_district_code, shipping_district, shipping_upazila_code, shipping_upazila, shipping_union_code, shipping_union, shipping_union_other, shipping_village, status, subtotal, delivery_fee, total,
        payment_method, payment_status, payment_transaction_id,
        payment_verified_at, payment_verified_by,
        delivery_provider, delivery_status, delivery_consignment_id,
        delivery_tracking_code, delivery_booked_at, delivery_error,
        stock_restored_at, stock_restored_by, stock_restoration_note,
        delivery_fee_payment_method, delivery_fee_payment_transaction_id,
        delivery_fee_payment_status, delivery_fee_payment_verified_at,
        created_at,
        order_items (id, product_name, unit_price, quantity)
      `
      : `
        id, order_number, customer_name, customer_phone, phone, address,
        shipping_address, shipping_city, shipping_division_code, shipping_division, shipping_district_code, shipping_district, shipping_upazila_code, shipping_upazila, shipping_union_code, shipping_union, shipping_union_other, shipping_village, status, subtotal, delivery_fee, total,
        payment_method, payment_status,
        delivery_provider, delivery_status, delivery_consignment_id,
        delivery_tracking_code, delivery_booked_at, delivery_error,
        stock_restored_at, stock_restored_by, stock_restoration_note,
        delivery_fee_payment_method, delivery_fee_payment_transaction_id,
        delivery_fee_payment_status, delivery_fee_payment_verified_at,
        created_at,
        order_items (id, product_name, unit_price, quantity)
      `;
    const { data, error } = await admin
      .from("orders")
      .select(orderColumns)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Admin orders query failed:", error.message);
      return NextResponse.json(
        { error: "Could not load orders. Verify the database columns." },
        { status: 500 }
      );
    }

    const orders = data ?? [];
    const orderIds = orders.map((order) => order.id);
    const restockedByItem = new Map<string, number>();
    if (orderIds.length > 0) {
      const { data: restocks, error: restockError } = await admin
        .from("order_item_return_restocks")
        .select("order_item_id,quantity")
        .in("order_id", orderIds);
      if (restockError) {
        console.error("Admin returned-item restock totals failed:", restockError.message);
        return NextResponse.json(
          { error: "Could not load returned-item inventory history." },
          { status: 500 }
        );
      }
      for (const row of restocks ?? []) {
        restockedByItem.set(
          row.order_item_id,
          (restockedByItem.get(row.order_item_id) ?? 0) + Number(row.quantity)
        );
      }
    }

    const ordersWithRestockTotals = orders.map((order) => ({
      ...order,
      order_items: (order.order_items ?? []).map((item) => ({
        ...item,
        restocked_quantity: restockedByItem.get(item.id) ?? 0,
      })),
    }));
    return NextResponse.json({ orders: ordersWithRestockTotals });
  } catch (error) {
    console.error("Admin orders GET failed:", error);
    return NextResponse.json({ error: "A server error occurred." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext();
    if ("error" in staff) {
      return NextResponse.json(
        { error: staff.error },
        { status: staff.status }
      );
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("orderId" in body) ||
      typeof body.orderId !== "string" ||
      !UUID_REGEX.test(body.orderId)
    ) {
      return NextResponse.json({ error: "Provide a valid Order ID." }, { status: 400 });
    }

    if (staff.role !== "supreme") {
      return NextResponse.json({ error: "Only Supreme can verify payment references." }, { status: 403 });
    }

    const action = "action" in body && body.action === "verify_delivery_fee"
      ? "verify_delivery_fee"
      : "verify_order_payment";
    const orderId = body.orderId;
    const admin = await getAdminClient();

    const { data, error } = action === "verify_delivery_fee"
      ? await admin.rpc("admin_verify_order_delivery_fee_payment", {
          p_order_id: orderId,
          p_actor_id: staff.user.id,
        })
      : await admin.rpc("admin_verify_order_payment", {
          p_order_id: orderId,
          p_actor_id: staff.user.id,
        });

    if (error) {
      if (error.message.includes("ORDER_NOT_VERIFIABLE") || error.message.includes("DELIVERY_FEE_PAYMENT_NOT_VERIFIABLE")) {
        return NextResponse.json(
          {
            error:
              "This order cannot be verified. Check the payment status and transaction ID.",
          },
          { status: 409 }
        );
      }

      console.error("Payment verification RPC failed:", error.message);
      return NextResponse.json(
        { error: "Payment verification failed. Check whether the SQL migration has been applied." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: data,
      message: action === "verify_delivery_fee"
        ? "Delivery fee payment was marked as Paid and an audit log was created."
        : "Payment was marked as Paid and an audit log was created.",
    });
  } catch (error) {
    console.error("Admin orders POST failed:", error);
    return NextResponse.json({ error: "A server error occurred." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const staff = await getStaffContext();

    if ("error" in staff) {
      return NextResponse.json(
        { error: staff.error },
        { status: staff.status }
      );
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > 8192) {
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Provide a valid request." },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;
    const orderId = input.orderId;
    const status = input.status;

    if (input.action === "restock_returned_items") {
      if (typeof orderId !== "string" || !UUID_REGEX.test(orderId)) {
        return NextResponse.json({ error: "Provide a valid Order ID." }, { status: 400 });
      }
      if (typeof input.note !== "string" || input.note.trim().length < 5 || input.note.trim().length > 500) {
        return NextResponse.json({ error: "Stock-restock reason must be between 5 and 500 characters." }, { status: 400 });
      }
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
        return NextResponse.json({ error: "Select between 1 and 50 returned order items." }, { status: 400 });
      }
      const items: Array<{ order_item_id: string; quantity: number; idempotency_key: string }> = [];
      const seen = new Set<string>();
      for (const rawItem of input.items) {
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
          return NextResponse.json({ error: "A returned-item entry is invalid." }, { status: 400 });
        }
        const item = rawItem as Record<string, unknown>;
        if (
          typeof item.order_item_id !== "string" || !UUID_REGEX.test(item.order_item_id) ||
          typeof item.idempotency_key !== "string" || !UUID_REGEX.test(item.idempotency_key) ||
          !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 ||
          seen.has(item.order_item_id)
        ) {
          return NextResponse.json({ error: "Returned-item IDs, quantities, or idempotency keys are invalid." }, { status: 400 });
        }
        seen.add(item.order_item_id);
        items.push({
          order_item_id: item.order_item_id,
          quantity: Number(item.quantity),
          idempotency_key: item.idempotency_key,
        });
      }

      const admin = await getAdminClient();
      const { data, error } = await admin.rpc("admin_restock_returned_order_items", {
        p_order_id: orderId,
        p_actor_id: staff.user.id,
        p_note: input.note.trim(),
        p_items: items,
      });
      if (error) {
        const conflicts = [
          "STOCK_ALREADY_RESTORED", "ORDER_NOT_RETURNED", "RESTOCK_QUANTITY_EXCEEDS_RETURNED",
          "IDEMPOTENCY_KEY_REUSED", "ORDER_ITEM_NOT_FOUND", "ORDER_PRODUCT_REFERENCE_MISSING",
          "ORDER_PRODUCT_NOT_FOUND", "DUPLICATE_RESTOCK_ITEM",
        ];
        if (conflicts.some((code) => error.message.includes(code))) {
          return NextResponse.json({ error: "The returned quantities changed or were already restocked. Refresh the order and verify the remaining quantities." }, { status: 409 });
        }
        if (error.message.includes("ACTOR_NOT_AUTHORIZED")) {
          return NextResponse.json({ error: "You are not authorized to restock returned inventory." }, { status: 403 });
        }
        console.error("Item-level returned stock restock failed:", error.message);
        return NextResponse.json({ error: "Could not restock the selected returned quantities." }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        result: data,
        message: "Inspected returned quantities were added to inventory.",
      });
    }

    if (input.action === "restock_returned") {
      if (typeof orderId !== "string" || !UUID_REGEX.test(orderId)) {
        return NextResponse.json({ error: "Provide a valid Order ID." }, { status: 400 });
      }
      if (typeof input.note !== "string" || input.note.trim().length < 5 || input.note.trim().length > 500) {
        return NextResponse.json({ error: "Stock-restock reason must be between 5 and 500 characters." }, { status: 400 });
      }
      const admin = await getAdminClient();
      const { data, error } = await admin.rpc("admin_restock_returned_order", {
        p_order_id: orderId,
        p_actor_id: staff.user.id,
        p_note: input.note.trim(),
      });
      if (error) {
        if (error.message.includes("STOCK_ALREADY_RESTORED")) {
          return NextResponse.json({ error: "Stock for this order has already been restocked." }, { status: 409 });
        }
        if (error.message.includes("ORDER_NOT_RETURNED")) {
          return NextResponse.json({ error: "Only Returned orders can be restocked." }, { status: 409 });
        }
        if (error.message.includes("ORDER_ITEMS_MISSING") || error.message.includes("ORDER_PRODUCT_REFERENCE_MISSING") || error.message.includes("ORDER_PRODUCTS_NOT_FOUND")) {
          return NextResponse.json({ error: "Some product records for this order are missing. Verify the product records manually before restocking." }, { status: 409 });
        }
        console.error("Returned order restock failed:", error.message);
        return NextResponse.json({ error: "Could not restock the items." }, { status: 500 });
      }
      return NextResponse.json({ success: true, result: data, message: "Product stock was restocked after verification." });
    }

    const allowedStatuses = [
      "pending", "confirmed", "processing", "packed",
      "shipped", "delivered", "cancelled", "returned"
    ];

    if (typeof orderId !== "string" || !UUID_REGEX.test(orderId)) {
      return NextResponse.json(
        { error: "Provide a valid Order ID." },
        { status: 400 }
      );
    }

    if (typeof status !== "string" || !allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid order status." },
        { status: 400 }
      );
    }

    const admin = await getAdminClient();

    const { data, error } = await admin.rpc("admin_update_order_status", {
      p_order_id: orderId,
      p_new_status: status,
      p_actor_id: staff.user.id,
    });

    if (error) {
      if (error.message.includes("ORDER_NOT_FOUND")) {
        return NextResponse.json(
          { error: "Order not found." },
          { status: 404 }
        );
      }

      if (error.message.includes("ORDER_CANNOT_BE_CANCELLED")) {
        return NextResponse.json(
          { error: "Shipped or delivered orders cannot be cancelled directly. Process a return, inspect the items, and update stock through the separate return workflow." },
          { status: 409 }
        );
      }

      console.error("Order status update RPC failed:", error.message);
      return NextResponse.json(
        { error: "Could not update the order status." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: data,
      message: "Order status updated.",
    });
  } catch (error) {
    console.error("Admin orders PATCH failed:", error);
    return NextResponse.json(
      { error: "A server error occurred." },
      { status: 500 }
    );
  }
}
