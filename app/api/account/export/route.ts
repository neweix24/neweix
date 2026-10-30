import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessionClient = await createServerSupabaseClient();
  const { data: authData, error: authError } = await sessionClient.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "লগইন প্রয়োজন।" }, { status: 401 });
  }

  try {
    const user = authData.user;
    const admin = await createRuntimeServiceClient();

    const [profileResult, addressesResult, preferencesResult, consentsResult, ordersResult] = await Promise.all([
      admin.from("customer_profiles")
        .select("full_name,display_name,phone,created_at,updated_at")
        .eq("user_id", user.id).maybeSingle(),
      admin.from("customer_addresses")
        .select("label,recipient_name,phone,address_line,area,upazila,district,division,postal_code,is_default,created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }),
      admin.from("customer_preferences")
        .select("preferred_sizes,preferred_colors,preferred_category_ids,updated_at")
        .eq("user_id", user.id).maybeSingle(),
      admin.from("customer_consents")
        .select("consent_type,consented,policy_version,source,created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }),
      admin.from("orders")
        .select("id,order_number,customer_name,customer_phone,customer_email,shipping_address,shipping_city,subtotal,delivery_fee,total,status,payment_method,payment_status,created_at")
        .eq("customer_user_id", user.id).order("created_at", { ascending: false }).limit(500),
    ]);

    const failures = [profileResult.error, addressesResult.error, preferencesResult.error, consentsResult.error, ordersResult.error].filter(Boolean);
    if (failures.length) {
      console.error("Customer data export query failed:", failures.map((item) => item?.message));
      return NextResponse.json({ error: "তথ্য রপ্তানি করা যায়নি। পরে আবার চেষ্টা করুন।" }, { status: 500 });
    }

    const orderIds = (ordersResult.data ?? []).map((order) => order.id);
    let orderItems: Array<Record<string, unknown>> = [];
    if (orderIds.length > 0) {
      const { data, error } = await admin.from("order_items")
        .select("order_id,product_name,unit_price,quantity")
        .in("order_id", orderIds);
      if (error) {
        console.error("Customer export order items failed:", error.message);
        return NextResponse.json({ error: "অর্ডারের পণ্যের তথ্য রপ্তানি করা যায়নি।" }, { status: 500 });
      }
      orderItems = data ?? [];
    }

    const itemsByOrder = new Map<string, Array<Record<string, unknown>>>();
    for (const item of orderItems) {
      const orderId = String(item.order_id);
      const current = itemsByOrder.get(orderId) ?? [];
      current.push({
        product_name: item.product_name,
        unit_price: item.unit_price,
        quantity: item.quantity,
      });
      itemsByOrder.set(orderId, current);
    }

    const exportedAt = new Date().toISOString();
    const payload = {
      exported_at: exportedAt,
      account: {
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
      },
      profile: profileResult.data,
      saved_addresses: addressesResult.data ?? [],
      preferences: preferencesResult.data,
      consent_history: consentsResult.data ?? [],
      orders: (ordersResult.data ?? []).map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
      })),
      notes: [
        "This export contains the account and order data currently associated with this signed-in account.",
        "Payment PINs, OTPs, passwords and card security codes are never included.",
      ],
    };

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "customer_data_exported",
      target_type: "customer_data",
      target_id: user.id,
      details: { exported_at: exportedAt, order_count: payload.orders.length },
    });
    if (auditError) console.error("Customer export audit log failed:", auditError.message);

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="neweix-personal-data-${exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Customer data export failed:", error);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}
