import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9-]{3,60}$/;
const PHONE_PATTERN = /^[0-9+()\-\s]{7,30}$/;

type RuntimeEnv = Record<string, unknown>;

type TrackedOrder = {
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  delivery_status: string;
  delivery_tracking_code: string | null;
};

function readServerEnv(name: string): string | undefined {
  try {
    const { env } = getCloudflareContext();
    const value = (env as RuntimeEnv)[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  } catch {
    // Fall back to process.env for local development.
  }

  const value = process.env[name];

  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function respond(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getClientKey(request: Request): string | null {
  // Prefer Cloudflare's client-IP header.
  const cloudflareIp = request.headers
    .get("cf-connecting-ip")
    ?.trim();

  // Fallback for environments outside Cloudflare.
  const realIp = request.headers.get("x-real-ip")?.trim();

  const ip = cloudflareIp || realIp;

  if (!ip || ip.length > 100) {
    return null;
  }

  // Store a hash rather than the raw IP address.
  return createHash("sha256").update(ip).digest("hex");
}

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const size = Number(contentLength);

    if (!Number.isSafeInteger(size) || size < 0) {
      return respond("Invalid request payload.", 400);
    }

    if (size > MAX_BODY_BYTES) {
      return respond("The request payload is too large.", 413);
    }
  }

  let body: unknown;

  try {
    const raw = await request.text();
    const bodySize = new TextEncoder().encode(raw).byteLength;

    if (bodySize > MAX_BODY_BYTES) {
      return respond("The request payload is too large.", 413);
    }

    body = JSON.parse(raw);
  } catch {
    return respond("Submit valid information.", 400);
  }

  if (!isRecord(body)) {
    return respond("Invalid order details.", 400);
  }

  const orderNumber =
    typeof body.order_number === "string"
      ? body.order_number.trim()
      : "";

  const phone =
    typeof body.phone === "string"
      ? body.phone.trim()
      : "";

  if (
    !ORDER_NUMBER_PATTERN.test(orderNumber) ||
    !PHONE_PATTERN.test(phone) ||
    !/[0-9]/.test(phone)
  ) {
    return respond("Enter a valid order number and phone number.", 400);
  }

  const supabaseUrl = readServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Order tracking: Required Supabase environment variables are missing."
    );

    return respond("Order tracking is temporarily unavailable.", 503);
  }

  try {
    const clientKey = getClientKey(request);

    if (!clientKey) {
      return respond(
        "Unable to verify the request. Please try again.",
        400
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Check the server-side rate limit before looking up an order.
    const { data: allowed, error: rateLimitError } = await supabase.rpc(
      "check_order_tracking_rate_limit",
      {
        p_client_key: clientKey,
      }
    );

    // Fail closed if the rate-limit check cannot be verified.
    if (rateLimitError || typeof allowed !== "boolean") {
      console.error(
        "Order tracking rate-limit check failed:",
        rateLimitError?.message ?? "Unexpected RPC response"
      );

      return respond(
        "Tracking is temporarily unavailable. Please try again later.",
        503
      );
    }

    if (!allowed) {
      return respond(
        "Too many attempts. Please try again in 10 minutes.",
        429
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .select(
        [
          "order_number",
          "status",
          "payment_method",
          "payment_status",
          "created_at",
          "delivery_status",
          "delivery_tracking_code",
        ].join(",")
      )
      .eq("order_number", orderNumber)
      .eq("customer_phone", phone)
      .maybeSingle();

    if (error) {
      console.error(
        "Order tracking lookup failed:",
        error.message
      );

      return respond(
        "Unable to verify the order details. Please try again later.",
        500
      );
    }

    if (!data) {
      return respond(
        "Order not found. Check your details and try again.",
        404
      );
    }

    const order = data as unknown as TrackedOrder;

    return NextResponse.json(
      {
        success: true,
        order: {
          order_number: order.order_number,
          status: order.status,
          payment_method: order.payment_method,
          payment_status: order.payment_status,
          created_at: order.created_at,
          delivery_status: order.delivery_status,
          delivery_tracking_code: order.delivery_tracking_code,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Unexpected order tracking error:", error);

    return respond(
      "A server error occurred. Please try again later.",
      500
    );
  }
}