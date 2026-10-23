import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 100;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OrderItem = {
  product_id: string;
  quantity: number;
};

type OrderBody = {
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  shipping_address: string;
  shipping_city: string | null;
  payment_method: "cod";
  items: OrderItem[];
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

export async function POST(request: Request) {
  // 1. Request body size validation
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const size = Number(contentLength);

    if (!Number.isSafeInteger(size) || size < 0) {
      return errorResponse("অনুরোধের আকার সঠিক নয়।", 400);
    }

    if (size > MAX_BODY_BYTES) {
      return errorResponse("অনুরোধের আকার অনেক বড়।", 413);
    }
  }

  // 2. Parse JSON safely
  let rawBody: unknown;

  try {
    const text = await request.text();

    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return errorResponse("অনুরোধের আকার অনেক বড়।", 413);
    }

    rawBody = JSON.parse(text);
  } catch {
    return errorResponse("সঠিক JSON তথ্য পাঠান।", 400);
  }

  // Handles null, arrays, strings and other invalid top-level values
  if (!isRecord(rawBody)) {
    return errorResponse("অর্ডারের তথ্য সঠিক নয়।", 400);
  }

  // 3. Validate customer information
  const customerName = cleanString(rawBody.customer_name);
  const customerPhone = cleanString(rawBody.customer_phone);
  const shippingAddress = cleanString(rawBody.shipping_address);

  const customerEmail =
    rawBody.customer_email == null
      ? null
      : cleanString(rawBody.customer_email);

  const shippingCity =
    rawBody.shipping_city == null
      ? null
      : cleanString(rawBody.shipping_city);

  if (!customerName || !customerPhone || !shippingAddress) {
    return errorResponse(
      "নাম, ফোন নম্বর ও ডেলিভারি ঠিকানা দিন।",
      400
    );
  }

  if (customerName.length > 120) {
    return errorResponse("নাম সর্বোচ্চ ১২০ অক্ষরের হতে পারবে।", 400);
  }

  if (
    customerPhone.length > 30 ||
    !/^[0-9+\-()\s]+$/.test(customerPhone) ||
    !/[0-9]/.test(customerPhone)
  ) {
    return errorResponse("সঠিক ফোন নম্বর দিন।", 400);
  }

  if (shippingAddress.length > 1000) {
    return errorResponse(
      "ডেলিভারি ঠিকানা সর্বোচ্চ ১০০০ অক্ষরের হতে পারবে।",
      400
    );
  }

  if (customerEmail !== null) {
    if (
      customerEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      return errorResponse("সঠিক ইমেইল ঠিকানা দিন।", 400);
    }
  }

  if (shippingCity !== null && shippingCity.length > 120) {
    return errorResponse("শহর বা জেলার নাম অনেক বড়।", 400);
  }

  // 4. Only Cash on Delivery is supported
  if (
    rawBody.payment_method != null &&
    rawBody.payment_method !== "cod"
  ) {
    return errorResponse(
      "আপাতত শুধু ক্যাশ অন ডেলিভারি চালু আছে।",
      400
    );
  }

  // 5. Validate cart
  if (
    !Array.isArray(rawBody.items) ||
    rawBody.items.length === 0 ||
    rawBody.items.length > MAX_ITEMS
  ) {
    return errorResponse("কার্টের পণ্যের তথ্য সঠিক নয়।", 400);
  }

  const items: OrderItem[] = [];
  const seenProductIds = new Set<string>();

  for (const rawItem of rawBody.items) {
    if (!isRecord(rawItem)) {
      return errorResponse("পণ্যের তথ্য সঠিক নয়।", 400);
    }

    const productId = rawItem.product_id;
    const quantity = rawItem.quantity;

    if (
      typeof productId !== "string" ||
      !UUID_REGEX.test(productId) ||
      !Number.isSafeInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > MAX_QUANTITY
    ) {
      return errorResponse(
        "পণ্যের ID অথবা পরিমাণ সঠিক নয়।",
        400
      );
    }

    const normalizedId = productId.toLowerCase();

    if (seenProductIds.has(normalizedId)) {
      return errorResponse(
        "একই পণ্য একাধিকবার আলাদা আইটেম হিসেবে পাঠানো যাবে না।",
        400
      );
    }

    seenProductIds.add(normalizedId);

    items.push({
      product_id: normalizedId,
      quantity: quantity as number,
    });
  }

  // 6. Read server-side Supabase credentials
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Order API: Supabase configuration is missing.");

    return errorResponse(
      "অর্ডার সার্ভার বর্তমানে প্রস্তুত নয়।",
      503
    );
  }

  // 7. Create order using the existing secure database function
  try {
    const supabase = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const orderBody: OrderBody = {
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      shipping_address: shippingAddress,
      shipping_city: shippingCity,
      payment_method: "cod",
      items,
    };

    const { data, error } = await supabase.rpc("create_order", {
      p_customer_name: orderBody.customer_name,
      p_customer_phone: orderBody.customer_phone,
      p_customer_email: orderBody.customer_email,
      p_shipping_address: orderBody.shipping_address,
      p_shipping_city: orderBody.shipping_city,
      p_payment_method: orderBody.payment_method,
      p_items: orderBody.items,
    });

    if (error) {
      // Keep internal database details out of the public response.
      console.error("Order creation failed:", error.message);

      return errorResponse(
        "অর্ডার তৈরি করা যায়নি। পণ্যের স্টক ও তথ্য যাচাই করুন।",
        400
      );
    }

    if (data == null) {
      console.error("Order creation returned no order data.");

      return errorResponse(
        "অর্ডারের ফলাফল নিশ্চিত করা যায়নি।",
        500
      );
    }

    return NextResponse.json(
      {
        message: "অর্ডার গ্রহণ করা হয়েছে।",
        order: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Order API unexpected error:", error);

    return errorResponse(
      "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।",
      500
    );
  }
}