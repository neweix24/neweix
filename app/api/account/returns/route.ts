import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETURN_REASONS = [
  "damaged",
  "wrong_item",
  "missing_item",
  "not_as_described",
  "quality_issue",
  "changed_mind",
  "other",
] as const;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}

async function getCustomerId() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
    return null;
  }
  return userId;
}

async function getAdminClient() {
  const context = await getCloudflareContext();
  const env = context.env as Record<string, string | undefined>;
  const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  try {
    const customerId = await getCustomerId();
    if (!customerId) return noStore({ error: "Sign in to view return requests." }, 401);

    const admin = await getAdminClient();
    const { data, error } = await admin
      .from("customer_return_requests")
      .select(`
        id, order_id, status, reason, customer_note, staff_note,
        refund_amount, refund_method, refund_reference,
        reviewed_at, created_at, updated_at,
        orders(order_number, status, total, created_at),
        customer_return_request_items(
          id, order_item_id, quantity,
          order_items(product_name, unit_price)
        )
      `)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Customer return request list failed:", error.message);
      return noStore({ error: "Could not load your return requests." }, 500);
    }

    return noStore({ requests: data ?? [] });
  } catch (error) {
    console.error("Customer return request GET failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const customerId = await getCustomerId();
    if (!customerId) return noStore({ error: "Sign in before requesting a return." }, 401);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16_384) {
      return noStore({ error: "The request is too large." }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return noStore({ error: "Submit valid JSON." }, 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return noStore({ error: "Invalid return request." }, 400);
    }

    const input = body as Record<string, unknown>;
    if (typeof input.order_id !== "string" || !UUID_PATTERN.test(input.order_id)) {
      return noStore({ error: "Select a valid order." }, 400);
    }
    if (typeof input.reason !== "string" || !RETURN_REASONS.includes(input.reason as typeof RETURN_REASONS[number])) {
      return noStore({ error: "Select a valid return reason." }, 400);
    }
    if (typeof input.customer_note !== "string" || input.customer_note.trim().length > 1000) {
      return noStore({ error: "The note must be 1,000 characters or fewer." }, 400);
    }
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) {
      return noStore({ error: "Select between 1 and 30 order items." }, 400);
    }

    const seen = new Set<string>();
    const items: Array<{ order_item_id: string; quantity: number }> = [];
    for (const value of input.items) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return noStore({ error: "A selected item is invalid." }, 400);
      }
      const item = value as Record<string, unknown>;
      if (
        typeof item.order_item_id !== "string" ||
        !UUID_PATTERN.test(item.order_item_id) ||
        !Number.isSafeInteger(item.quantity) ||
        Number(item.quantity) < 1 ||
        Number(item.quantity) > 999_999 ||
        seen.has(item.order_item_id)
      ) {
        return noStore({ error: "Check the selected item IDs and quantities." }, 400);
      }
      seen.add(item.order_item_id);
      items.push({ order_item_id: item.order_item_id, quantity: Number(item.quantity) });
    }

    const admin = await getAdminClient();
    const { data, error } = await admin.rpc("customer_create_return_request", {
      p_customer_id: customerId,
      p_order_id: input.order_id,
      p_reason: input.reason,
      p_note: input.customer_note.trim(),
      p_items: items,
    });

    if (error) {
      if (error.message.includes("ORDER_NOT_FOUND")) {
        return noStore({ error: "Order not found." }, 404);
      }
      if (error.message.includes("ORDER_NOT_RETURNABLE")) {
        return noStore({ error: "Only delivered orders can be returned." }, 409);
      }
      if (error.message.includes("RETURN_REQUEST_ALREADY_ACTIVE")) {
        return noStore({ error: "A return request is already being reviewed for this order." }, 409);
      }
      if (error.message.includes("RETURN_QUANTITY_EXCEEDS_REMAINING")) {
        return noStore({ error: "The requested quantity is greater than the remaining eligible quantity." }, 409);
      }
      if (error.message.includes("ORDER_ITEM_NOT_FOUND")) {
        return noStore({ error: "One or more selected items do not belong to this order." }, 400);
      }
      if (error.message.includes("INVALID_RETURN") || error.message.includes("DUPLICATE_RETURN_ITEM")) {
        return noStore({ error: "Check the return details and selected items." }, 400);
      }
      console.error("Customer return request RPC failed:", error.message);
      return noStore({ error: "Could not submit your return request." }, 500);
    }

    return noStore({
      success: true,
      request_id: data,
      message: "Your return request has been submitted for review.",
    }, 201);
  } catch (error) {
    console.error("Customer return request POST failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}
