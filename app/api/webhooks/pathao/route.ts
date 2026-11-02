import { NextResponse } from "next/server";
import { createAdminSupabaseClient, getServerSetting } from "@/lib/phone-verification";
import { getPathaoOrderInfo } from "@/lib/pathao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_OR_CONSIGNMENT = /^[A-Za-z0-9-]{3,80}$/;

function webhookResponse(
  body: Record<string, unknown>,
  status: number,
  responseSecret: string | null,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(responseSecret ? { "X-Pathao-Merchant-Webhook-Integration-Secret": responseSecret } : {}),
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function getProviderStatus(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object"
    ? root.data as Record<string, unknown>
    : {};
  const value = data.order_status_slug ?? data.order_status ?? data.status ??
    root.order_status_slug ?? root.order_status ?? root.status;
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z]/g, "") : "";
}

function mapPathaoStatus(status: string): string | null {
  if (!status) return null;
  if (status.includes("deliver")) return "delivered";
  if (status.includes("return")) return "returned";
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("pickupfailed") || status.includes("deliveryfailed") || status === "failed") return "failed";
  if (status === "picked" || status.includes("pickedup")) return "picked_up";
  if (
    status.includes("transit") ||
    status.includes("sortinghub") ||
    status.includes("lastmilehub") ||
    status.includes("assignedfordelivery")
  ) return "in_transit";
  return null;
}

const terminalStates = new Set(["delivered", "returned", "cancelled"]);
const statusRank: Record<string, number> = {
  not_booked: 0,
  pending_approval: 0,
  booking: 0,
  booked: 1,
  picked_up: 2,
  in_transit: 3,
  delivered: 4,
  returned: 4,
  cancelled: 4,
  failed: 0,
};

export async function POST(request: Request) {
  const configuredSecret = getServerSetting("PATHAO_WEBHOOK_SECRET");
  const responseSecret = getServerSetting("PATHAO_WEBHOOK_RESPONSE_SECRET");
  if (!configuredSecret || configuredSecret.length < 24 || !responseSecret || responseSecret.length < 24) {
    return webhookResponse({ error: "Pathao webhook is not configured." }, 503, null);
  }

  const signature = request.headers.get("X-PATHAO-SIGNATURE") ?? "";
  if (!signature || !constantTimeEqual(signature, configuredSecret)) {
    return webhookResponse({ error: "Invalid Pathao webhook signature." }, 401, responseSecret);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 32_768) {
    return webhookResponse({ error: "Webhook payload is too large." }, 413, responseSecret);
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 32_768) {
      return webhookResponse({ error: "Webhook payload is too large." }, 413, responseSecret);
    }
    payload = JSON.parse(raw);
  } catch {
    return webhookResponse({ error: "Invalid JSON payload." }, 400, responseSecret);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return webhookResponse({ error: "Invalid webhook payload." }, 400, responseSecret);
  }

  const event = (payload as Record<string, unknown>).event;
  if (event === "webhook_integration") {
    return webhookResponse({ accepted: true, message: "Pathao webhook integration verified." }, 202, responseSecret);
  }

  const consignmentId = (payload as Record<string, unknown>).consignment_id;
  if (typeof consignmentId !== "string" || !UUID_OR_CONSIGNMENT.test(consignmentId)) {
    return webhookResponse({ error: "A valid consignment ID is required." }, 400, responseSecret);
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, delivery_status")
      .eq("delivery_provider", "pathao")
      .eq("delivery_consignment_id", consignmentId)
      .maybeSingle();

    if (orderError) {
      console.error("Pathao webhook order lookup failed:", orderError.message);
      return webhookResponse({ error: "Unable to locate the linked order." }, 503, responseSecret);
    }
    if (!order) {
      return webhookResponse({ accepted: true, ignored: true, reason: "Unknown consignment." }, 202, responseSecret);
    }

    // Treat the webhook only as a notification. Fetch the current state from Pathao
    // before changing NEWEIX order data; never trust status or amount fields in the callback.
    const providerOrder = await getPathaoOrderInfo(consignmentId);
    const providerStatus = getProviderStatus(providerOrder);
    const nextStatus = mapPathaoStatus(providerStatus);
    if (!nextStatus) {
      return webhookResponse({ accepted: true, synced: false, reason: "Provider status is not mapped." }, 202, responseSecret);
    }

    const currentStatus = typeof order.delivery_status === "string" ? order.delivery_status : "booked";
    if (
      terminalStates.has(currentStatus) ||
      (statusRank[nextStatus] ?? 0) < (statusRank[currentStatus] ?? 0)
    ) {
      return webhookResponse({ accepted: true, synced: false, reason: "A newer delivery state is already stored." }, 202, responseSecret);
    }

    if (currentStatus === nextStatus) {
      return webhookResponse({ accepted: true, synced: true, unchanged: true }, 202, responseSecret);
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        delivery_status: nextStatus,
        delivery_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("delivery_provider", "pathao")
      .eq("delivery_consignment_id", consignmentId);

    if (updateError) {
      console.error("Pathao webhook order update failed:", updateError.message);
      return webhookResponse({ error: "Unable to update the linked order." }, 503, responseSecret);
    }

    return webhookResponse({ accepted: true, synced: true, deliveryStatus: nextStatus }, 202, responseSecret);
  } catch (error) {
    console.error(
      "Pathao webhook processing failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return webhookResponse({ error: "Pathao status verification is temporarily unavailable." }, 503, responseSecret);
  }
}
