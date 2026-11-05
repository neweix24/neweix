import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}

async function authenticatedClient() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !UUID_PATTERN.test(userId)) return null;
  return { supabase, userId };
}

export async function GET() {
  try {
    const auth = await authenticatedClient();
    if (!auth) return noStore({ error: "Sign in to view notifications." }, 401);

    const { data, error } = await auth.supabase
      .from("customer_notifications")
      .select("id,event_type,title,body,href,read_at,created_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30);

    if (error) {
      console.error("Customer notifications query failed:", error.message);
      return noStore({ error: "Could not load notifications right now." }, 500);
    }

    const notifications = data ?? [];
    return noStore({
      notifications,
      unread_count: notifications.reduce((count, item) => count + (item.read_at ? 0 : 1), 0),
    });
  } catch (error) {
    console.error("Customer notifications API failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticatedClient();
    if (!auth) return noStore({ error: "Sign in to update notifications." }, 401);

    let body: unknown;
    try { body = await request.json(); } catch { return noStore({ error: "Invalid request body." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return noStore({ error: "Invalid request body." }, 400);
    }

    const input = body as Record<string, unknown>;
    let query = auth.supabase
      .from("customer_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", auth.userId)
      .is("read_at", null);

    if (input.mark_all_read === true) {
      // The owner filter is retained; a customer can only mark their own rows.
    } else if (typeof input.id === "string" && UUID_PATTERN.test(input.id)) {
      query = query.eq("id", input.id);
    } else {
      return noStore({ error: "Provide a valid notification ID or mark_all_read." }, 400);
    }

    const { data, error } = await query.select("id");
    if (error) {
      console.error("Customer notification update failed:", error.message);
      return noStore({ error: "Could not update notification right now." }, 500);
    }

    return noStore({ updated: data?.length ?? 0 });
  } catch (error) {
    console.error("Customer notification update API failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}
