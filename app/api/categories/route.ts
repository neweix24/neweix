import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, string | undefined>;
    const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return NextResponse.json({ error: "সার্ভার কনফিগারেশন অসম্পূর্ণ।" }, { status: 503 });
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description, image_url, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(100);

    if (error) {
      console.error("Public categories API failed:", error.message);
      return NextResponse.json({ error: "ক্যাটাগরি লোড করা যায়নি।" }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, categories: data ?? [] },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("Public categories API error:", error);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}
