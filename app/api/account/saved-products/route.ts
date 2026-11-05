import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ListType = "wishlist" | "compare";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}

async function getAuth() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !UUID.test(userId)) return null;
  return { supabase, userId };
}

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return response({ error: "Sign in to sync saved products." }, 401);
    const { data, error } = await auth.supabase
      .from("customer_saved_products")
      .select("product_id,list_type,created_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: true })
      .limit(204);
    if (error) {
      console.error("Saved products read failed:", error.message);
      return response({ error: "Could not load your saved products." }, 500);
    }
    const rows = data ?? [];
    return response({
      wishlist: rows.filter((row) => row.list_type === "wishlist").map((row) => row.product_id).slice(-200),
      compare: rows.filter((row) => row.list_type === "compare").map((row) => row.product_id).slice(-4),
    });
  } catch (error) {
    console.error("Saved products API failed:", error);
    return response({ error: "A server error occurred." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return response({ error: "Sign in to sync saved products." }, 401);
    let body: unknown;
    try { body = await request.json(); } catch { return response({ error: "Invalid request body." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Invalid request body." }, 400);
    const input = body as Record<string, unknown>;
    const listType = input.list_type;
    const productId = input.product_id;
    const action = input.action;
    if ((listType !== "wishlist" && listType !== "compare") || typeof productId !== "string" || !UUID.test(productId) || (action !== "add" && action !== "remove")) {
      return response({ error: "Provide a valid list type, product ID and action." }, 400);
    }
    if (action === "remove") {
      const { error } = await auth.supabase.from("customer_saved_products")
        .delete().eq("user_id", auth.userId).eq("product_id", productId).eq("list_type", listType);
      if (error) {
        console.error("Saved product removal failed:", error.message);
        return response({ error: "Could not remove this saved product." }, 500);
      }
      return response({ saved: false });
    }
    if (listType === "compare") {
      const { count, error } = await auth.supabase.from("customer_saved_products")
        .select("product_id", { count: "exact", head: true })
        .eq("user_id", auth.userId).eq("list_type", "compare");
      if (error) return response({ error: "Could not validate your comparison list." }, 500);
      const { data: existing } = await auth.supabase.from("customer_saved_products")
        .select("product_id").eq("user_id", auth.userId).eq("list_type", "compare").eq("product_id", productId).maybeSingle();
      if (!existing && (count ?? 0) >= 4) return response({ error: "You can compare up to 4 products." }, 409);
    }
    if (listType === "wishlist") {
      const { count, error } = await auth.supabase.from("customer_saved_products")
        .select("product_id", { count: "exact", head: true })
        .eq("user_id", auth.userId).eq("list_type", "wishlist");
      if (error) return response({ error: "Could not validate your wishlist." }, 500);
      const { data: existing } = await auth.supabase.from("customer_saved_products")
        .select("product_id").eq("user_id", auth.userId).eq("list_type", "wishlist").eq("product_id", productId).maybeSingle();
      if (!existing && (count ?? 0) >= 200) return response({ error: "Your wishlist can contain up to 200 products." }, 409);
    }
    const { error } = await auth.supabase.from("customer_saved_products")
      .upsert({ user_id: auth.userId, product_id: productId, list_type: listType }, { onConflict: "user_id,list_type,product_id", ignoreDuplicates: true });
    if (error) {
      console.error("Saved product write failed:", error.message);
      return response({ error: "Could not save this product." }, 500);
    }
    return response({ saved: true });
  } catch (error) {
    console.error("Saved products update failed:", error);
    return response({ error: "A server error occurred." }, 500);
  }
}
