import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeBangladeshPhone } from "@/lib/phone-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 100;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYMENT_METHODS = [
  "cod",
  "bkash",
  "nagad",
  "rocket",
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number];

type OrderItem = {
  product_id: string;
  quantity: number;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status }
  );
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const result = value.trim();
  return result.length > 0 ? result : null;
}

export async function POST(request: Request) {
  // Reject an oversized request before parsing JSON.
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const size = Number(contentLength);

    if (!Number.isSafeInteger(size) || size < 0) {
      return errorResponse(
        "অনুরোধের আকার সঠিক নয়।",
        400
      );
    }

    if (size > MAX_BODY_BYTES) {
      return errorResponse(
        "অনুরোধের আকার অনেক বড়।",
        413
      );
    }
  }

  // Parse and independently check the actual body size.
  let rawBody: unknown;

  try {
    const text = await request.text();

    if (
      new TextEncoder().encode(text).byteLength >
      MAX_BODY_BYTES
    ) {
      return errorResponse(
        "অনুরোধের আকার অনেক বড়।",
        413
      );
    }

    rawBody = JSON.parse(text);
  } catch {
    return errorResponse(
      "সঠিক JSON তথ্য পাঠান।",
      400
    );
  }

  if (!isRecord(rawBody)) {
    return errorResponse(
      "অর্ডারের তথ্য সঠিক নয়।",
      400
    );
  }

  // Validate customer information.
  const customerName = cleanString(
    rawBody.customer_name
  );

  let customerPhone = cleanString(
    rawBody.customer_phone
  );

  const shippingAddress = cleanString(
    rawBody.shipping_address
  );

  const customerEmail =
    rawBody.customer_email == null
      ? null
      : cleanString(rawBody.customer_email);

  const shippingCity =
    rawBody.shipping_city == null
      ? null
      : cleanString(rawBody.shipping_city);

  if (
    !customerName ||
    !customerPhone ||
    !shippingAddress
  ) {
    return errorResponse(
      "নাম, ফোন নম্বর ও ঠিকানা দিন।",
      400
    );
  }

  if (
    customerName.length < 2 ||
    customerName.length > 120
  ) {
    return errorResponse(
      "নাম ২ থেকে ১২০ অক্ষরের মধ্যে হতে হবে।",
      400
    );
  }

  if (
    customerPhone.length > 30 ||
    !/^[0-9+\-()\s]+$/.test(customerPhone) ||
    !/[0-9]/.test(customerPhone) ||
    customerPhone.replace(/\D/g, "").length < 7
  ) {
    return errorResponse(
      "সঠিক ফোন নম্বর দিন।",
      400
    );
  }

  if (
    shippingAddress.length < 5 ||
    shippingAddress.length > 1000
  ) {
    return errorResponse(
      "ঠিকানা ৫ থেকে ১০০০ অক্ষরের মধ্যে হতে হবে।",
      400
    );
  }

  if (customerEmail !== null) {
    if (
      customerEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        customerEmail
      )
    ) {
      return errorResponse(
        "সঠিক ইমেইল ঠিকানা দিন।",
        400
      );
    }
  }

  if (
    shippingCity !== null &&
    shippingCity.length > 120
  ) {
    return errorResponse(
      "শহর বা জেলার নাম অনেক বড়।",
      400
    );
  }

  // Validate optional coupon code. Pricing and usage are enforced atomically in SQL.
  let couponCode: string | null = null;
  if (rawBody.coupon_code != null && rawBody.coupon_code !== "") {
    if (typeof rawBody.coupon_code !== "string") {
      return errorResponse("কুপন কোড সঠিক নয়।", 400);
    }
    couponCode = rawBody.coupon_code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(couponCode)) {
      return errorResponse("কুপন কোড ৩–৪০ অক্ষরের ইংরেজি অক্ষর, সংখ্যা, হাইফেন বা আন্ডারস্কোর হতে হবে।", 400);
    }
  }

  // Validate the payment method.
  const paymentMethodValue =
    rawBody.payment_method == null
      ? "cod"
      : rawBody.payment_method;

  if (
    typeof paymentMethodValue !== "string" ||
    !PAYMENT_METHODS.includes(
      paymentMethodValue as PaymentMethod
    )
  ) {
    return errorResponse(
      "সঠিক পেমেন্ট পদ্ধতি নির্বাচন করুন।",
      400
    );
  }

  const paymentMethod =
    paymentMethodValue as PaymentMethod;

  const transactionId = cleanString(rawBody.payment_transaction_id);
  const deliveryFeePaymentMethod = cleanString(rawBody.delivery_fee_payment_method);
  const deliveryFeeTransactionId = cleanString(rawBody.delivery_fee_payment_transaction_id);

  if (paymentMethod === "cod") {
    if (transactionId) {
      return errorResponse("COD পণ্যের পেমেন্টের Transaction ID গ্রহণযোগ্য নয়।", 400);
    }
    if (!deliveryFeePaymentMethod || !["bkash", "nagad", "rocket"].includes(deliveryFeePaymentMethod)) {
      return errorResponse("COD অর্ডারের ডেলিভারি চার্জের জন্য bKash, Nagad অথবা Rocket নির্বাচন করুন।", 400);
    }
    if (!deliveryFeeTransactionId || deliveryFeeTransactionId.length > 120 || !/^[A-Za-z0-9-]+$/.test(deliveryFeeTransactionId)) {
      return errorResponse("ডেলিভারি চার্জের সঠিক Transaction ID দিন।", 400);
    }
  } else if (deliveryFeePaymentMethod || deliveryFeeTransactionId) {
    return errorResponse("MFS অর্ডারে ডেলিভারি চার্জ আলাদা করে জমা দেবেন না; মোট বিল একবারে পরিশোধ করুন।", 400);
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

  // Validate and normalize cart items.
  if (
    !Array.isArray(rawBody.items) ||
    rawBody.items.length === 0 ||
    rawBody.items.length > MAX_ITEMS
  ) {
    return errorResponse(
      "কার্টের পণ্যের তথ্য সঠিক নয়।",
      400
    );
  }

  const items: OrderItem[] = [];
  const seen = new Set<string>();

  for (const item of rawBody.items) {
    if (!isRecord(item)) {
      return errorResponse(
        "পণ্যের তথ্য সঠিক নয়।",
        400
      );
    }

    const id = item.product_id;
    const quantity = item.quantity;

    if (
      typeof id !== "string" ||
      !UUID_REGEX.test(id) ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      return errorResponse(
        "পণ্যের ID অথবা পরিমাণ সঠিক নয়।",
        400
      );
    }

    const normalizedId = id.toLowerCase();

    if (seen.has(normalizedId)) {
      return errorResponse(
        "একই পণ্য একাধিকবার পাঠানো যাবে না।",
        400
      );
    }

    seen.add(normalizedId);

    items.push({
      product_id: normalizedId,
      quantity,
    });
  }

  // Read Cloudflare Worker bindings.
  let url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  let serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  let mobilePaymentEnabled = false;

  try {
    const { env } = getCloudflareContext();
    const runtimeEnv =
      env as Record<string, unknown>;

    const runtimeUrl =
      runtimeEnv.NEXT_PUBLIC_SUPABASE_URL;

    const runtimeServiceKey =
      runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;

    if (
      typeof runtimeUrl === "string" &&
      runtimeUrl.trim().length > 0
    ) {
      url = runtimeUrl;
    }

    if (
      typeof runtimeServiceKey === "string" &&
      runtimeServiceKey.length > 0
    ) {
      serviceKey = runtimeServiceKey;
    }

    // The server must enforce mobile payment configuration.
    const selectedMfs = paymentMethod === "cod" ? deliveryFeePaymentMethod : paymentMethod;
    if (selectedMfs && ["bkash", "nagad", "rocket"].includes(selectedMfs)) {
      const paymentEnvKeys = {
        bkash: "PAYMENT_BKASH_NUMBER",
        nagad: "PAYMENT_NAGAD_NUMBER",
        rocket: "PAYMENT_ROCKET_NUMBER",
      } as const;
      const configuredNumber = runtimeEnv[paymentEnvKeys[selectedMfs as keyof typeof paymentEnvKeys]];
      mobilePaymentEnabled = typeof configuredNumber === "string" && configuredNumber.trim().length > 0;
    }
  } catch (error) {
    console.error(
      "Unable to read Cloudflare environment:",
      error
    );
  }

  if (!mobilePaymentEnabled) {
    return errorResponse(
      "এই পেমেন্ট পদ্ধতি বর্তমানে চালু নেই। অন্য পদ্ধতি নির্বাচন করুন।",
      400
    );
  }

  if (
    typeof url !== "string" ||
    url.trim().length === 0 ||
    typeof serviceKey !== "string" ||
    serviceKey.length === 0
  ) {
    console.error(
      "Order API: required Supabase configuration is missing."
    );

    return errorResponse(
      "অর্ডার সার্ভার কনফিগার করা নেই।",
      503
    );
  }

  // Create the order using trusted server-side database logic.
  try {
    const supabase = createClient(
      url,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // Expire eligible unpaid mobile orders first.
    const { error: expiryError } =
      await supabase.rpc(
        "expire_unpaid_mobile_orders"
      );

    if (expiryError) {
      console.error(
        "Unpaid order expiry failed:",
        expiryError.message
      );

      return errorResponse(
        "অর্ডার সিস্টেম সাময়িকভাবে ব্যস্ত। একটু পরে আবার চেষ্টা করুন।",
        503
      );
    }

    // Guest orders are allowed. Link an order to a customer account only
    // when that account has a phone number verified by our server-side OTP flow.
    const sessionClient = await createServerSupabaseClient();
    const { data: authData } = await sessionClient.auth.getUser();
    const signedInCustomerId = authData.user?.id ?? null;
    let linkedCustomerId: string | null = null;

    if (signedInCustomerId) {
      const { data: customerProfile, error: profileError } = await supabase
        .from("customer_profiles")
        .select("phone, phone_verified_at")
        .eq("user_id", signedInCustomerId)
        .maybeSingle();

      if (profileError) {
        console.error("Customer phone verification lookup failed:", profileError.message);
        return errorResponse("ফোন নম্বর যাচাই করা যাচ্ছে না। পরে আবার চেষ্টা করুন।", 503);
      }

      const verifiedPhone =
        customerProfile?.phone_verified_at && typeof customerProfile.phone === "string"
          ? normalizeBangladeshPhone(customerProfile.phone)
          : null;

      // Unverified accounts may still use guest checkout, but their order
      // is not associated with the account until phone verification succeeds.
      if (verifiedPhone) {
        const submittedPhone = normalizeBangladeshPhone(customerPhone);
        if (!submittedPhone || submittedPhone !== verifiedPhone) {
          return errorResponse("চেকআউটের ফোন নম্বর আপনার যাচাইকৃত অ্যাকাউন্ট নম্বরের সঙ্গে মিলছে না।", 400);
        }
        customerPhone = verifiedPhone;
        linkedCustomerId = signedInCustomerId;
      }
    }

    const { data, error } =
      await supabase.rpc(
        "create_order_with_prepaid_delivery",
        {
          p_customer_name: customerName,
          p_customer_phone: customerPhone,
          p_customer_email: customerEmail,
          p_shipping_address: shippingAddress,
          p_shipping_city: shippingCity,
          p_payment_method: paymentMethod,
          p_payment_transaction_id:
            paymentMethod === "cod"
              ? null
              : transactionId,
          p_items: items,
          p_coupon_code: couponCode,
          p_customer_id: linkedCustomerId,
          p_delivery_fee_payment_method: paymentMethod === "cod" ? deliveryFeePaymentMethod : null,
          p_delivery_fee_payment_transaction_id: paymentMethod === "cod" ? deliveryFeeTransactionId : null,
        }
      );

    if (error) {
      const errorMessage = String(
        error.message ?? ""
      ).toLowerCase();

      const errorCode = String(
        error.code ?? ""
      );

      console.error(
        "Order creation failed:",
        {
          code: errorCode,
          message: error.message,
        }
      );

      // Reject duplicate mobile payment transaction IDs.
      if (
        errorCode === "23505" &&
        (
          errorMessage.includes(
            "payment_transaction_id"
          ) ||
          errorMessage.includes(
            "orders_payment_transaction_id_normalized_uidx"
          )
        )
      ) {
        return errorResponse(
          "এই Transaction ID আগে ব্যবহার করা হয়েছে। পেমেন্টের তথ্য যাচাই করে সঠিক Transaction ID দিন।",
          409
        );
      }

      if (
        errorMessage.includes("coupon") ||
        errorMessage.includes("discount")
      ) {
        return errorResponse(
          "কুপন কোডটি অকার্যকর, মেয়াদোত্তীর্ণ, ব্যবহারের সীমা শেষ অথবা ন্যূনতম অর্ডার মূল্য পূরণ হয়নি।",
          400
        );
      }

      if (
        errorMessage.includes("transaction") ||
        errorMessage.includes("payment")
      ) {
        return errorResponse(
          "পেমেন্টের তথ্য গ্রহণ করা যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।",
          400
        );
      }

      if (
        errorMessage.includes("stock") ||
        errorMessage.includes(
          "product unavailable"
        ) ||
        errorMessage.includes("insufficient")
      ) {
        return errorResponse(
          "পণ্যটি এখন পর্যাপ্ত মজুতে নেই অথবা অর্ডার করা যাচ্ছে না। কার্ট আপডেট করে আবার চেষ্টা করুন।",
          409
        );
      }

      return errorResponse(
        "অর্ডার তৈরি করা যায়নি। তথ্য ও পণ্যের মজুত যাচাই করে আবার চেষ্টা করুন।",
        400
      );
    }

    if (
      !data ||
      typeof data !== "object"
    ) {
      console.error(
        "Order API returned empty or invalid data."
      );

      return errorResponse(
        "অর্ডারের ফলাফল নিশ্চিত করা যায়নি।",
        500
      );
    }

    return NextResponse.json(
      {
        message:
          "অর্ডার গ্রহণ করা হয়েছে। পেমেন্ট যাচাই বাকি আছে।",
        order: data,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Unexpected order API error:",
      error
    );

    return errorResponse(
      "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।",
      500
    );
  }
}