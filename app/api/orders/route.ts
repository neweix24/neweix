import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type OrderItemInput = {
  product_id: string;
  quantity: number;
};

type OrderInput = {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  shipping_address: string;
  shipping_city?: string;
  payment_method?: "cod";
  items: OrderItemInput[];
};

const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  let body: OrderInput;

  try {
    body = (await request.json()) as OrderInput;
  } catch {
    return jsonError("সঠিক JSON তথ্য পাঠান।", 400);
  }

  const customerName = body.customer_name?.trim();
  const customerPhone = body.customer_phone?.trim();
  const shippingAddress = body.shipping_address?.trim();
  const items = body.items;

  if (
    !customerName ||
    !customerPhone ||
    !shippingAddress ||
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 50
  ) {
    return jsonError("নাম, ফোন, ঠিকানা ও পণ্যের তালিকা দিন।", 400);
  }

  if (
    customerName.length > 120 ||
    customerPhone.length > 30 ||
    shippingAddress.length > 1000
  ) {
    return jsonError("প্রদত্ত তথ্যের দৈর্ঘ্য সীমা অতিক্রম করেছে।", 400);
  }

  const normalizedItems: OrderItemInput[] = [];
  const quantities = new Map<string, number>();

  for (const item of items) {
    if (
      typeof item?.product_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item.product_id
      ) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100
    ) {
      return jsonError("পণ্যের আইডি বা পরিমাণ সঠিক নয়।", 400);
    }

    quantities.set(
      item.product_id,
      (quantities.get(item.product_id) ?? 0) + item.quantity
    );
  }

  for (const [product_id, quantity] of quantities) {
    if (quantity > 100) {
      return jsonError("একটি পণ্যের সর্বোচ্চ পরিমাণ ১০০।", 400);
    }
    normalizedItems.push({ product_id, quantity });
  }

  if (
    body.customer_email &&
    (body.customer_email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer_email))
  ) {
    return jsonError("ইমেইল ঠিকানাটি সঠিক নয়।", 400);
  }

  // This secret must remain server-side; never use a NEXT_PUBLIC_ variable.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError("অর্ডার সার্ভার এখনো কনফিগার করা হয়নি।", 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // The database function must validate prices and stock, lock inventory,
  // and insert the order + items in one transaction.
  const { data, error } = await supabase.rpc("create_order", {
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_customer_email: body.customer_email?.trim() || null,
    p_shipping_address: shippingAddress,
    p_shipping_city: body.shipping_city?.trim() || null,
    p_payment_method: body.payment_method ?? "cod",
    p_items: normalizedItems,
  });

  if (error) {
    // Log server-side details only; do not expose database errors to shoppers.
    console.error("Order creation failed:", error.message);
    return jsonError("অর্ডার তৈরি করা যায়নি। তথ্য ও স্টক যাচাই করে আবার চেষ্টা করুন।", 400);
  }

  return NextResponse.json(
    { message: "অর্ডার গ্রহণ করা হয়েছে।", order: data },
    { status: 201 }
  );
}