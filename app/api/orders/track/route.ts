import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9-]{3,60}$/;
const PHONE_PATTERN = /^[0-9+()-\s]{7,30}$/;

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

if (typeof value === "string" &amp;&amp; value.trim()) {
  return value.trim();
}

} catch {
// Local development fallback.
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
headers: { "Cache-Control": "no-store, max-age=0" },
}
);
}

function isRecord(value: unknown): value is Record<string, unknown> {
return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getClientKey(request: Request): string | null {
// Vercel sets forwarding headers. Use the first address in the chain.
const forwardedFor = request.headers.get("x-forwarded-for");
const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
const realIp = request.headers.get("x-real-ip")?.trim();
const ip = firstForwardedIp || realIp;

if (!ip || ip.length > 100) {
return null;
}

// Store only a SHA-256 digest, not the raw IP address.
return createHash("sha256").update(ip).digest("hex");
}

export async function POST(request: Request) {
const length = request.headers.get("content-length");

if (length !== null) {
const size = Number(length);

if (!Number.isSafeInteger(size) || size &lt; 0) {
  return respond("অনুরোধের তথ্য সঠিক নয়।", 400);
}

if (size &gt; MAX_BODY_BYTES) {
  return respond("অনুরোধের তথ্য অনেক বড়।", 413);
}

}

let body: unknown;

try {
const raw = await request.text();

if (new TextEncoder().encode(raw).byteLength &gt; MAX_BODY_BYTES) {
  return respond("অনুরোধের তথ্য অনেক বড়।", 413);
}

body = JSON.parse(raw);

} catch {
return respond("সঠিক তথ্য পাঠান।", 400);
}

if (!isRecord(body)) {
return respond("অর্ডারের তথ্য সঠিক নয়।", 400);
}

const orderNumber =
typeof body.order_number === "string" ? body.order_number.trim() : "";
const phone = typeof body.phone === "string" ? body.phone.trim() : "";

if (
!ORDER_NUMBER_PATTERN.test(orderNumber) ||
!PHONE_PATTERN.test(phone) ||
!/[0-9]/.test(phone)
) {
return respond("সঠিক অর্ডার নম্বর ও ফোন নম্বর দিন।", 400);
}

const url = readServerEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = readServerEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!url || !serviceRoleKey) {
console.error("Order tracking: Supabase server environment is missing.");
return respond("অর্ডার ট্র্যাকিং সাময়িকভাবে চালু নেই।", 503);
}

try {
const supabase = createClient(url, serviceRoleKey, {
auth: {
persistSession: false,
autoRefreshToken: false,
},
});

const clientKey = getClientKey(request);

if (!clientKey) {
  return respond("অনুরোধ যাচাই করা যাচ্ছে না। আবার চেষ্টা করুন।", 400);
}

const { data: allowed, error: rateLimitError } = await supabase.rpc(
  "check_order_tracking_rate_limit",
  { p_client_key: clientKey }
);

// Fail closed: if rate limiting cannot be verified, do not expose order data.
if (rateLimitError || typeof allowed !== "boolean") {
  console.error(
    "Order tracking rate limit check failed:",
    rateLimitError?.message ?? "Unexpected RPC response"
  );
  return respond("ট্র্যাকিং সাময়িকভাবে চালু নেই। পরে আবার চেষ্টা করুন।", 503);
}

if (!allowed) {
  return respond(
    "অনেকবার চেষ্টা করা হয়েছে। ১০ মিনিট পরে আবার চেষ্টা করুন।",
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
  console.error("Order tracking lookup failed:", error.message);
  return respond(
    "অর্ডার খুঁজে পাওয়া যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।",
    404
  );
}

if (!data) {
  return respond(
    "অর্ডার খুঁজে পাওয়া যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।",
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
    headers: { "Cache-Control": "no-store, max-age=0" },
  }
);

} catch (error) {
console.error("Unexpected order tracking error:", error);
return respond("সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।", 500);
}
}