import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 try {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  const context = await getCloudflareContext(); const env = context.env as unknown as Record<string, unknown>;
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof url !== "string" || typeof key !== "string") return NextResponse.json({ error: "সার্চ সেবা কনফিগার করা হয়নি।" }, { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("neweix_search_products", { p_query: query, p_query_embedding: null, p_category_id: null, p_min_price: null, p_max_price: null, p_in_stock: false, p_sort: "relevance", p_limit: 6, p_offset: 0 });
  if (error) { console.error("Search suggestions failed:", error.message); return NextResponse.json({ error: "সাজেশন লোড করা যায়নি।" }, { status: 503 }); }
  return NextResponse.json({ suggestions: (data ?? []).map((p: { id: string; name: string; slug: string; price: number; image_urls: string[] | null }) => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, image: p.image_urls?.[0] ?? null })) }, { headers: { "Cache-Control": "no-store" } });
 } catch (error) { console.error("Search suggestions error:", error); return NextResponse.json({ error: "সার্চ সাজেশন পাওয়া যায়নি।" }, { status: 500 }); }
}