import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: {
    customer_name?: string;
    customer_phone?: string;
    customer_email?: string;
    shipping_address?: string;
    shipping_city?: string;
    payment_method?: string;
    items?: { product_id: string; quantity: number }[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "সঠিক তথ্য পাঠান।" },
      { status: 400 }
    );
  }

  if (
    !body.customer_name?.trim() ||
    !body.customer_phone?.trim() ||
    !body.shipping_address?.trim() ||
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    body.items.length > 50
  ) {
    return NextResponse.json(
      { error: "নাম, ফোন, ঠিকানা ও পণ্যের তথ্য দিন।" },
      { status: 400 }
    );
  }

  for (const item of body.items) {
    if (
      typeof item.product_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item.product_id
      ) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100
    ) {
      return NextResponse.json(
        { error: "পণ্যের তথ্য সঠিক নয়।" },
        { status: 400 }
      );
    }
  }

  if (body.payment_method && body.payment_method !== "cod") {
    return NextResponse.json(
      { error: "শুধু ক্যাশ অন ডেলিভারি আপাতত চালু আছে।" },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "অর্ডার সার্ভার কনফিগার করা হয়নি।" },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.rpc("create_order", {
    p_customer_name: body.customer_name.trim(),
    p_customer_phone: body.customer_phone.trim(),
    p_customer_email: body.customer_email?.trim() || null,
    p_shipping_address: body.shipping_address.trim(),
    p_shipping_city: body.shipping_city?.trim() || null,
    p_payment_method: "cod",
    p_items: body.items,
  });

  if (error) {
    console.error("Order creation failed:", error.message);
    return NextResponse.json(
      { error: "অর্ডার তৈরি করা যায়নি। তথ্য ও স্টক যাচাই করুন।" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { message: "অর্ডার গ্রহণ করা হয়েছে।", order: data },
    { status: 201 }
  );
}