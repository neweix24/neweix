import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await context.params;
    if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
      return noStore({ error: "Order not found." }, 404);
    }

    const supabase = await createServerSupabaseClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;

    if (claimsError || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
      return noStore({ error: "Sign in to view this order." }, 401);
    }

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id,order_number,status,payment_status,payment_method,subtotal,delivery_fee,discount,total,created_at,updated_at,delivery_status,delivery_tracking_code,delivery_provider,delivered_at,shipping_address,shipping_city,shipping_division,shipping_district,shipping_upazila,shipping_union,shipping_union_other,shipping_village,order_items(id,product_name,quantity,unit_price,line_total)",
      )
      .eq("id", orderId)
      .eq("customer_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Customer order detail query failed:", error.message);
      return noStore({ error: "Could not load this order right now." }, 500);
    }

    if (!data) {
      // Do not disclose whether an order ID belongs to another customer.
      return noStore({ error: "Order not found." }, 404);
    }

    return noStore({ order: data });
  } catch (error) {
    console.error("Customer order detail API failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}
