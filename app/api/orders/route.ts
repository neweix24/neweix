
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 100;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYMENT_METHODS = ["cod", "bkash", "nagad", "rocket"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length ? result : null;
}

export async function POST(request: Request) {
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

  if (!isRecord(rawBody)) {
    return errorResponse("অর্ডারের তথ্য সঠিক নয়।", 400);
  }

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
    return errorResponse("নাম, ফোন নম্বর ও ঠিকানা দিন।", 400);
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
    return errorResponse("ঠিকানা সর্বোচ্চ ১০০০ অক্ষরের হতে পারবে।", 400);
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

  const paymentMethodValue =
    rawBody.payment_method == null ? "cod" : rawBody.payment_method;

  if (
    typeof paymentMethodValue !== "string" ||
    !PAYMENT_METHODS.includes(paymentMethodValue as PaymentMethod)
  ) {
    return errorResponse("সঠিক পেমেন্ট পদ্ধতি নির্বাচন করুন।", 400);
  }

  const paymentMethod = paymentMethodValue as PaymentMethod;
  const transactionId = cleanString(rawBody.payment_transaction_id);

  if (paymentMethod === "cod" && transactionId) {
    return errorResponse(
      "ক্যাশ অন ডেলিভারির জন্য Transaction ID প্রয়োজন নেই।",
      400
    );
  }

  if (paymentMethod !== "cod") {
    if (
      !transactionId ||
      transactionId.length > 120 ||
      !/^[A-Za-z0-9-]+$/.test(transactionId)
    ) {
      return errorResponse(
        "সঠিক Transaction ID দিন। ইংরেজি অক্ষর, সংখ্যা ও হাইফেন ব্যবহার করুন।",
        400
      );
    }
  }

  if (
    !Array.isArray(rawBody.items) ||
    rawBody.items.length === 0 ||
    rawBody.items.length > MAX_ITEMS
  ) {
    return errorResponse("কার্টের পণ্যের তথ্য সঠিক নয়।", 400);
  }

  const items: { product_id: string; quantity: number }[] = [];
  const seen = new Set<string>();

  for (const item of rawBody.items) {
    if (!isRecord(item)) {
      return errorResponse("পণ্যের তথ্য সঠিক নয়।", 400);
    }

    const id = item.product_id;
    const quantity = item.quantity;

    if (
      typeof id !== "string" ||
      !UUID_REGEX.test(id) ||
      !Number.isSafeInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > MAX_QUANTITY
    ) {
      return errorResponse("পণ্যের ID অথবা পরিমাণ সঠিক নয়।", 400);
    }

    const normalizedId = id.toLowerCase();

    if (seen.has(normalizedId)) {
      return errorResponse("একই পণ্য একাধিকবার পাঠানো যাবে না।", 400);
    }

    seen.add(normalizedId);
    items.push({
      product_id: normalizedId,
      quantity: quantity as number,
    });
  }

  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, unknown>;

    const runtimeUrl = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL;
    const runtimeServiceKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;

    if (typeof runtimeUrl === "string" && runtimeUrl.length > 0) {
      url = runtimeUrl;
    }

    if (
      typeof runtimeServiceKey === "string" &&
      runtimeServiceKey.length > 0
    ) {
      serviceKey = runtimeServiceKey;
    }
  } catch (error) {
    console.error("Unable to read Cloudflare environment:", error);
  }

  if (!url || !serviceKey) {
    console.error("Order API: Supabase environment variables are missing.");
    return errorResponse("অর্ডার সার্ভার কনফিগার করা নেই।", 503);
  }

  try {
    const supabase = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.rpc(
      "create_order_with_payment",
      {
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_customer_email: customerEmail,
        p_shipping_address: shippingAddress,
        p_shipping_city: shippingCity,
        p_payment_method: paymentMethod,
        p_payment_transaction_id:
          paymentMethod === "cod" ? null : transactionId,
        p_items: items,
      }
    );

    if (error) {
      console.error("Order creation failed:", error.message);

      if (
        error.message?.toLowerCase().includes("transaction") ||
        error.message?.toLowerCase().includes("payment")
      ) {
        return errorResponse(
          "পেমেন্টের তথ্য গ্রহণ করা যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।",
          400
        );
      }

      return errorResponse(
        "অর্ডার তৈরি করা যায়নি। পণ্যের স্টক ও তথ্য যাচাই করুন।",
        400
      );
    }

    if (!data || typeof data !== "object") {
      console.error("Order API returned empty or invalid data.");
      return errorResponse("অর্ডারের ফলাফল নিশ্চিত করা যায়নি।", 500);
    }

    return NextResponse.json(
      {
        message:
          paymentMethod === "cod"
            ? "অর্ডার গ্রহণ করা হয়েছে।"
            : "অর্ডার গ্রহণ করা হয়েছে। পেমেন্ট যাচাই বাকি আছে।",
        order: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected order API error:", error);
    return errorResponse("সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।", 500);
  }
}
