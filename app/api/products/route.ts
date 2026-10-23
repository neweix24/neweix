
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
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
  } catch (error) {
    console.error("Products API runtime error:", error);
    return NextResponse.json(
      { error: "পণ্য লোড করা যায়নি।" },
      { status: 500 }
    );
  }
}
