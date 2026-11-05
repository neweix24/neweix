import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 20;
const MAX_PAGE = 10_000;

function parsePrice(value: string | null): number | null | "invalid" {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}

export async function GET(request: Request) {
  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, string | undefined>;
    const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, MAX_PAGE)
      : 1;

    if (!paginated) {
      // Preserve the legacy full-list response for existing cart, checkout,
      // wishlist and related-product consumers.
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, price, compare_at_price, image_urls, video_url, stock, category_id, variants, sku, is_active, is_featured, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Products API error:", error.message);
        return NextResponse.json({ error: "পণ্য লোড করা যায়নি।" }, { status: 500 });
      }
      return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const search = (searchParams.get("search") ?? "").trim().slice(0, 160)
      .replace(/[,.()\\%_*]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const categorySlug = (searchParams.get("category") ?? "").trim().slice(0, 120);
    const minPrice = parsePrice(searchParams.get("minPrice"));
    const maxPrice = parsePrice(searchParams.get("maxPrice"));
    const inStockOnly = searchParams.get("inStock") === "1";
    const requestedSort = searchParams.get("sort");
    const sort = requestedSort === "price-asc" || requestedSort === "price-desc"
      ? requestedSort
      : "featured";

    if (minPrice === "invalid" || maxPrice === "invalid" ||
      (typeof minPrice === "number" && typeof maxPrice === "number" && minPrice > maxPrice)) {
      return NextResponse.json({ error: "Invalid price range." }, { status: 400 });
    }

    let categoryId: string | null = null;
    if (categorySlug) {
      const { data: category, error: categoryError } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .eq("is_active", true)
        .maybeSingle();

      if (categoryError) {
        console.error("Product category lookup failed:", categoryError.message);
        return NextResponse.json({ error: "ক্যাটাগরি লোড করা যায়নি।" }, { status: 500 });
      }
      if (!category) {
        return NextResponse.json(
          { data: [], page, pageSize: PAGE_SIZE, total: 0, hasMore: false },
          { headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120" } }
        );
      }
      categoryId = category.id;
    }

    let query = supabase
      .from("products")
      .select(
        "id, name, slug, description, price, compare_at_price, image_urls, video_url, stock, category_id, variants, sku, is_active, is_featured, created_at",
        { count: "exact" }
      )
      .eq("is_active", true);

    if (categoryId) query = query.eq("category_id", categoryId);
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`name.ilike.${pattern},description.ilike.${pattern},sku.ilike.${pattern}`);
    }
    if (typeof minPrice === "number") query = query.gte("price", minPrice);
    if (typeof maxPrice === "number") query = query.lte("price", maxPrice);
    if (inStockOnly) query = query.gt("stock", 0);

    if (sort === "price-asc") query = query.order("price", { ascending: true }).order("created_at", { ascending: false });
    else if (sort === "price-desc") query = query.order("price", { ascending: false }).order("created_at", { ascending: false });
    else query = query.order("is_featured", { ascending: false }).order("created_at", { ascending: false });

    const from = (page - 1) * PAGE_SIZE;
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Products API error:", error.message);
      return NextResponse.json({ error: "পণ্য লোড করা যায়নি।" }, { status: 500 });
    }

    const total = count ?? 0;
    return NextResponse.json(
      { data: data ?? [], page, pageSize: PAGE_SIZE, total, hasMore: page * PAGE_SIZE < total },
      { headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (error) {
    console.error("Products API runtime error:", error);
    return NextResponse.json(
      { error: "পণ্য লোড করা যায়নি।" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
