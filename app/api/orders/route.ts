import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeBangladeshPhone } from "@/lib/phone-verification";
import { resolveBangladeshAddress } from "@/lib/bangladesh-admin";

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
        "Invalid request size.",
        400
      );
    }

    if (size > MAX_BODY_BYTES) {
      return errorResponse(
        "The request payload is too large.",
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
        "The request payload is too large.",
        413
      );
    }

    rawBody = JSON.parse(text);
  } catch {
    return errorResponse(
      "Submit valid JSON.",
      400
    );
  }

  if (!isRecord(rawBody)) {
    return errorResponse(
      "Invalid order details.",
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

  const shippingDivisionCode = cleanString(rawBody.shipping_division_code);
  const shippingDistrictCode = cleanString(rawBody.shipping_district_code);
  const shippingUpazilaCode = cleanString(rawBody.shipping_upazila_code);
  const shippingUpazilaOther = cleanString(rawBody.shipping_upazila_other);
  const shippingUnionCode = cleanString(rawBody.shipping_union_code);
  const shippingUnionOther = cleanString(rawBody.shipping_union_other);
  const shippingVillage = cleanString(rawBody.shipping_village);

  if (!shippingDivisionCode || !shippingDistrictCode || !shippingUpazilaCode
      || !shippingUnionCode || !shippingVillage) {
    return errorResponse("Select or enter your division, district, upazila, union/area, and village/ward.", 400);
  }

  const resolvedAddress = resolveBangladeshAddress(
    shippingDivisionCode,
    shippingDistrictCode,
    shippingUpazilaCode,
    shippingUnionCode
  );
  if (!resolvedAddress) {
    return errorResponse("The selected division, district, upazila, and union do not match. Please select them again.", 400);
  }
  if (shippingUpazilaCode === "other" && (!shippingUpazilaOther || shippingUpazilaOther.length < 2 || shippingUpazilaOther.length > 120)) {
    return errorResponse("Enter the upazila name if it is not listed.", 400);
  }
  if (shippingUnionCode === "other" && (!shippingUnionOther || shippingUnionOther.length < 2 || shippingUnionOther.length > 120)) {
    return errorResponse("Enter the union or area name if it is not listed.", 400);
  }
  if (shippingVillage.length < 2 || shippingVillage.length > 160) {
    return errorResponse("Enter a village, ward, or neighborhood name between 2 and 160 characters.", 400);
  }
  const shippingCity = resolvedAddress.district.bn_name;

  if (
    !customerName ||
    !customerPhone ||
    !shippingAddress
  ) {
    return errorResponse(
      "Enter your name, phone number, and address.",
      400
    );
  }

  if (
    customerName.length < 2 ||
    customerName.length > 120
  ) {
    return errorResponse(
      "Name must be between 2 and 120 characters.",
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
      "Enter a valid phone number.",
      400
    );
  }

  if (
    shippingAddress.length < 5 ||
    shippingAddress.length > 1000
  ) {
    return errorResponse(
      "Address must be between 5 and 1,000 characters.",
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
        "Enter a valid email address.",
        400
      );
    }
  }

  if (
    shippingCity !== null &&
    shippingCity.length > 120
  ) {
    return errorResponse(
      "City or district name is too long.",
      400
    );
  }

  // Validate optional coupon code. Pricing and usage are enforced atomically in SQL.
  let couponCode: string | null = null;
  if (rawBody.coupon_code != null && rawBody.coupon_code !== "") {
    if (typeof rawBody.coupon_code !== "string") {
      return errorResponse("Invalid coupon code.", 400);
    }
    couponCode = rawBody.coupon_code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(couponCode)) {
      return errorResponse("Coupon codes must be 3–40 characters and may contain English letters, numbers, hyphens, or underscores.", 400);
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
      "Select a valid payment method.",
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
      return errorResponse("A transaction ID is not accepted for cash-on-delivery product payments.", 400);
    }
    if (Boolean(deliveryFeePaymentMethod) !== Boolean(deliveryFeeTransactionId)) {
      return errorResponse("Provide both the delivery-fee payment method and transaction ID, or leave both empty.", 400);
    }
    if (deliveryFeePaymentMethod && !["bkash", "nagad", "rocket"].includes(deliveryFeePaymentMethod)) {
      return errorResponse("Select bKash, Nagad, or Rocket to pay the delivery fee.", 400);
    }
    if (deliveryFeeTransactionId && (deliveryFeeTransactionId.length > 120 || !/^[A-Za-z0-9-]+$/.test(deliveryFeeTransactionId))) {
      return errorResponse("Enter a valid delivery-fee transaction ID.", 400);
    }
  } else if (deliveryFeePaymentMethod || deliveryFeeTransactionId) {
    return errorResponse("For MFS orders, do not pay the delivery fee separately; pay the total amount in one transaction.", 400);
  }

  if (paymentMethod !== "cod") {
    if (
      !transactionId ||
      transactionId.length > 120 ||
      !/^[A-Za-z0-9-]+$/.test(transactionId)
    ) {
      return errorResponse(
        "Enter a valid transaction ID using English letters, numbers, and hyphens.",
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
      "Invalid cart item details.",
      400
    );
  }

  const items: OrderItem[] = [];
  const seen = new Set<string>();

  for (const item of rawBody.items) {
    if (!isRecord(item)) {
      return errorResponse(
        "Invalid product details.",
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
        "Invalid product ID or quantity.",
        400
      );
    }

    const normalizedId = id.toLowerCase();

    if (seen.has(normalizedId)) {
      return errorResponse(
        "The same product cannot be submitted more than once.",
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
    const requiresMfsConfiguration = paymentMethod !== "cod" || Boolean(deliveryFeePaymentMethod || deliveryFeeTransactionId);
    if (!requiresMfsConfiguration && paymentMethod === "cod") {
      mobilePaymentEnabled = true;
    }
    if (requiresMfsConfiguration && selectedMfs && ["bkash", "nagad", "rocket"].includes(selectedMfs)) {
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
      "This payment method is currently unavailable. Select another method.",
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
      "The order service is not configured.",
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

    // Cloudflare supplies cf-connecting-ip at the edge. Store only a SHA-256
    // digest in the database; never persist the raw client IP for this limiter.
    const clientIp = request.headers.get("cf-connecting-ip")?.trim();

    if (!clientIp) {
      console.error("Order API: trusted client IP header is missing.");
      return errorResponse(
        "The order service is temporarily unavailable. Please try again shortly.",
        503,
      );
    }

    const ipDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(clientIp),
    );
    const ipHash = Array.from(new Uint8Array(ipDigest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    const { data: rateLimitAllowed, error: rateLimitError } =
      await supabase.rpc("check_order_creation_rate_limit", {
        p_ip_hash: ipHash,
      });

    if (rateLimitError) {
      console.error("Order creation rate-limit check failed:", rateLimitError.message);
      return errorResponse(
        "The order service is temporarily unavailable. Please try again shortly.",
        503,
      );
    }

    if (rateLimitAllowed !== true) {
      return NextResponse.json(
        { error: "Too many order attempts. Please wait 10 minutes before trying again." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "600",
          },
        },
      );
    }

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
        "The order system is temporarily busy. Please try again shortly.",
        503
      );
    }

    // Guest orders are allowed. Link an order to a customer account only
    // when that account has a phone number verified by our server-side OTP flow.
    const sessionClient = await createServerSupabaseClient();
    const { data: authData, error: authError } = await sessionClient.auth.getClaims();
    const claimSubject = authData?.claims?.sub;
    if (authError) {
      console.error("Customer session verification failed:", authError.message);
      return errorResponse("Unable to verify your login session. Please sign in again.", 401);
    }
    const signedInCustomerId = typeof claimSubject === "string" ? claimSubject : null;
    let linkedCustomerId: string | null = null;

    if (signedInCustomerId) {
      const { data: customerProfile, error: profileError } = await supabase
        .from("customer_profiles")
        .select("phone, phone_verified_at")
        .eq("user_id", signedInCustomerId)
        .maybeSingle();

      if (profileError) {
        console.error("Customer phone verification lookup failed:", profileError.message);
        return errorResponse("Unable to verify the phone number. Please try again later.", 503);
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
          return errorResponse("The checkout phone number does not match your verified account phone number.", 400);
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
          p_shipping_division_code: resolvedAddress.division.code,
          p_shipping_division: resolvedAddress.division.bn_name,
          p_shipping_district_code: resolvedAddress.district.code,
          p_shipping_district: resolvedAddress.district.bn_name,
          p_shipping_upazila_code: shippingUpazilaCode,
          p_shipping_upazila: resolvedAddress.upazila?.bn_name ?? shippingUpazilaOther,
          p_shipping_union_code: shippingUnionCode,
          p_shipping_union: resolvedAddress.union?.bn_name ?? (shippingUnionCode === "other" ? shippingUnionOther : null),
          p_shipping_union_other: shippingUnionCode === "other" ? shippingUnionOther : null,
          p_shipping_village: shippingVillage,
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
          "This transaction ID has already been used. Verify the payment details and enter the correct transaction ID.",
          409
        );
      }

      if (
        errorMessage.includes("coupon") ||
        errorMessage.includes("discount")
      ) {
        return errorResponse(
          "The coupon is invalid, expired, has reached its usage limit, or the minimum order value has not been met.",
          400
        );
      }

      if (errorMessage.includes("delivery_fee_mfs_required") || errorMessage.includes("delivery_fee_payment_details_incomplete")) {
        return errorResponse("Pay this order's delivery fee using bKash, Nagad, or Rocket first, then provide the transaction ID.", 400);
      }

      if (
        errorMessage.includes("transaction") ||
        errorMessage.includes("payment")
      ) {
        return errorResponse(
          "Payment details could not be accepted. Verify the information and try again.",
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
          "This product is out of stock or unavailable. Update your cart and try again.",
          409
        );
      }

      return errorResponse(
        "Unable to create the order. Verify your details and product availability, then try again.",
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
        "The order result could not be confirmed.",
        500
      );
    }

    return NextResponse.json(
      {
        message:
          "Your order has been received. Payment verification is pending.",
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
      "A server error occurred. Please try again later.",
      500
    );
  }
}