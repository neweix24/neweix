import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PUBLIC_CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=300";

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, string | undefined>;
    const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { error: "Public storefront data is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = createClient(url, key);
    const [productsResult, categoriesResult] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, slug, price, compare_at_price, image_urls, stock, is_featured, category_id")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("categories")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .limit(100),
    ]);

    if (productsResult.error) throw productsResult.error;
    if (categoriesResult.error) {
      console.error("Homepage categories query failed:", categoriesResult.error.message);
    }

    return NextResponse.json(
      {
        products: productsResult.data ?? [],
        categories: categoriesResult.data ?? [],
      },
      { headers: { "Cache-Control": PUBLIC_CACHE } }
    );
  } catch (error) {
    console.error("Public homepage data failed:", error);
    return NextResponse.json(
      { error: "Homepage data could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
