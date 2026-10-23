import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase environment variables are missing." },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, description, price, compare_at_price, image_urls, video_url, stock, category_id, variants, sku, is_active, is_featured, created_at"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Products API error:", error.message);

    return NextResponse.json(
      { error: "পণ্য লোড করা যায়নি।" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [] });
}