import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_STATUSES = ["approved", "rejected", "received", "refunded", "closed"] as const;
const REFUND_METHODS = ["original", "bkash", "nagad", "rocket", "bank", "eixon", "manual"] as const;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}

async function getStaffContext() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
    return { error: "Authentication required.", status: 401 as const };
  }

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("role,is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true || !["supreme", "admin"].includes(profile.role)) {
    return { error: "You are not authorized to manage return requests.", status: 403 as const };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== "aal2") {
      return { error: "Complete MFA for the Supreme account.", status: 403 as const };
    }
  }

  return { userId, role: profile.role };
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
    const staff = await getStaffContext();
    if ("error" in staff) return noStore({ error: staff.error }, staff.status);

    const admin = await getAdminClient();
    const { data, error } = await admin
      .from("customer_return_requests")
      .select(`
        id, customer_id, order_id, status, reason, customer_note, staff_note,
        refund_amount, refund_method, refund_reference, reviewed_by,\n        stock_restocked_at, stock_restocked_by,
        reviewed_at, created_at, updated_at,
        orders(order_number, customer_name, customer_phone, status, total, created_at),
        customer_return_request_items(
          id, order_item_id, quantity,
          order_items(product_name, unit_price, quantity)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Admin return request list failed:", error.message);
      return noStore({ error: "Could not load return requests." }, 500);
    }
    return noStore({ requests: data ?? [] });
  } catch (error) {
    console.error("Admin return request GET failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const staff = await getStaffContext();
    if ("error" in staff) return noStore({ error: staff.error }, staff.status);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) {
      return noStore({ error: "Request is too large." }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return noStore({ error: "Submit valid JSON." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return noStore({ error: "Invalid review request." }, 400);
    }

    const input = body as Record<string, unknown>;
    if (typeof input.request_id !== "string" || !UUID_PATTERN.test(input.request_id)) {
      return noStore({ error: "Provide a valid return request ID." }, 400);
    }
    if (typeof input.status !== "string" || !REVIEW_STATUSES.includes(input.status as typeof REVIEW_STATUSES[number])) {
      return noStore({ error: "Select a valid review status." }, 400);
    }
    if (input.staff_note !== undefined && (typeof input.staff_note !== "string" || input.staff_note.trim().length > 1000)) {
      return noStore({ error: "Staff note must be 1,000 characters or fewer." }, 400);
    }
    if (input.status === "refunded") {
      if (!Number.isSafeInteger(input.refund_amount) || Number(input.refund_amount) < 0) {
        return noStore({ error: "Enter a valid refund amount in BDT." }, 400);
      }
      if (typeof input.refund_method !== "string" || !REFUND_METHODS.includes(input.refund_method as typeof REFUND_METHODS[number])) {
        return noStore({ error: "Select a valid refund method." }, 400);
      }
      if (input.refund_reference !== undefined && (typeof input.refund_reference !== "string" || input.refund_reference.trim().length > 120)) {
        return noStore({ error: "Refund reference must be 120 characters or fewer." }, 400);
      }
    }

    const admin = await getAdminClient();
    const { data, error } = await admin.rpc("admin_review_customer_return_request", {
      p_request_id: input.request_id,
      p_actor_id: staff.userId,
      p_new_status: input.status,
      p_staff_note: typeof input.staff_note === "string" ? input.staff_note.trim() : null,
      p_refund_amount: input.status === "refunded" ? Number(input.refund_amount) : null,
      p_refund_method: input.status === "refunded" ? input.refund_method : null,
      p_refund_reference: input.status === "refunded" && typeof input.refund_reference === "string"
        ? input.refund_reference.trim()
        : null,
    });

    if (error) {
      if (error.message.includes("RETURN_REQUEST_NOT_FOUND")) {
        return noStore({ error: "Return request not found." }, 404);
      }
      if (error.message.includes("INVALID_RETURN_STATUS_TRANSITION")) {
        return noStore({ error: "This return request cannot move to that status from its current state." }, 409);
      }
      if (error.message.includes("REFUND_DETAILS_REQUIRED")) {
        return noStore({ error: "Refund amount and method are required before marking a request refunded." }, 400);
      }
      if (error.message.includes("ACTOR_NOT_AUTHORIZED")) {
        return noStore({ error: "You are not authorized to review return requests." }, 403);
      }
      console.error("Admin return review RPC failed:", error.message);
      return noStore({ error: "Could not update this return request." }, 500);
    }

    return noStore({
      success: true,
      result: data,
      message: "Return request status updated and audit log recorded.",
    });
  } catch (error) {
    console.error("Admin return request PATCH failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}
