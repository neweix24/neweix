
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, string | undefined>;

    const url =
      runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const key =
      runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.error("Supabase environment variables are missing.");
      return NextResponse.json(
        { error: "Supabase environment variables are missing." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = createClient(url, key);

    const { searchParams } = new URL(request.url);
    const paginated = searchParams.has("page");
    const requestedPage = Number(searchParams.get("page") ?? "1");
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = 20;

    let query = supabase
      .from("products")
      .select(
        "id, name, slug, description, price, compare_at_price, image_urls, video_url, stock, category_id, variants, sku, is_active, is_featured, created_at",
        paginated ? { count: "exact" } : undefined
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (paginated) {
      const from = (page - 1) * pageSize;
      query = query.range(from, from + pageSize - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Products API error:", error.message);
      return NextResponse.json(
        { error: "পণ্য লোড করা যায়নি।" },
        { status: 500 }
      );
    }

    if (paginated) {
      const total = count ?? 0;
      return NextResponse.json(
        { data: data ?? [], page, pageSize, total, hasMore: page * pageSize < total },
        { headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120" } }
      );
    }

    // Keep the legacy unpaginated response for cart, checkout, wishlist and
    // related-product consumers; the public catalogue always opts into pages.
    return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Products API runtime error:", error);
    return NextResponse.json(
      { error: "পণ্য লোড করা যায়নি।" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
