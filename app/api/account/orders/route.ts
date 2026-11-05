import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;

    if (claimsError || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
      return noStore({ error: "Sign in to view your orders." }, 401);
    }

    const url = new URL(request.url);
    const rawPage = Number(url.searchParams.get("page") ?? "1");
    const rawLimit = Number(url.searchParams.get("limit") ?? "20");

    if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > MAX_PAGE ||
        !Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_PAGE_SIZE) {
      return noStore({ error: "Invalid pagination values." }, 400);
    }

    const from = (rawPage - 1) * rawLimit;
    const to = from + rawLimit - 1;

    const { data, error, count } = await supabase
      .from("orders")
      .select(
        "id,order_number,status,payment_status,payment_method,subtotal,delivery_fee,discount,total,created_at,delivery_status,delivery_tracking_code,order_items(id,product_name,quantity,unit_price,line_total)",
        { count: "exact" },
      )
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Customer order history query failed:", error.message);
      return noStore({ error: "Could not load your orders right now." }, 500);
    }

    return noStore({
      orders: data ?? [],
      pagination: {
        page: rawPage,
        page_size: rawLimit,
        total: count ?? 0,
        total_pages: Math.ceil((count ?? 0) / rawLimit),
      },
    });
  } catch (error) {
    console.error("Customer order history API failed:", error);
    return noStore({ error: "A server error occurred." }, 500);
  }
}
