import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type AiBinding = { run(model: string, input: { text: string[] }): Promise<{ data?: number[][] }> };
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
function int(value: string | null, fallback: number, min: number, max: number) { if (value === null || value.trim() === "") return fallback; const n = Number(value); return Number.isSafeInteger(n) ? Math.min(max, Math.max(min, n)) : fallback; }
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 160);
    const categoryId = url.searchParams.get("categoryId");
    const minPrice = url.searchParams.has("minPrice") ? int(url.searchParams.get("minPrice"), 0, 0, 1000000000) : null;
    const maxPrice = url.searchParams.has("maxPrice") ? int(url.searchParams.get("maxPrice"), 1000000000, 0, 1000000000) : null;
    const inStock = url.searchParams.get("inStock") === "true";
    const rawSort = url.searchParams.get("sort") ?? "relevance";
    const sort = ["relevance", "price_asc", "price_desc", "newest"].includes(rawSort) ? rawSort : "relevance";
    const limit = int(url.searchParams.get("limit"), 24, 1, 50);
    const page = int(url.searchParams.get("page"), 1, 1, 100000);
    const offset = int(url.searchParams.get("offset"), (page - 1) * limit, 0, 1000000);
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) return json({ error: "সর্বনিম্ন দাম সর্বোচ্চ দামের চেয়ে বেশি হতে পারবে না।" }, 400);
    if (categoryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryId)) return json({ error: "ক্যাটাগরি সঠিক নয়।" }, 400);
    const context = await getCloudflareContext();
    const env = context.env as unknown as Record<string, unknown>;
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (typeof supabaseUrl !== "string" || typeof anonKey !== "string") return json({ error: "সার্চ সেবা কনফিগার করা হয়নি।" }, 503);
    let embedding: number[] | null = null;
    let aiUsed = false;
    const ai = env.AI as AiBinding | undefined;
    if (query.length >= 3 && ai && typeof ai.run === "function") {
      try {
        const result = await ai.run("@cf/baai/bge-m3", { text: [query] });
        const vector = result.data?.[0];
        if (Array.isArray(vector) && vector.length === 1024 && vector.every(Number.isFinite)) { embedding = vector; aiUsed = true; }
      } catch (error) { console.warn("AI embedding unavailable; using keyword search.", error); }
    }
    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.rpc("neweix_search_products", {
      p_query: query,
      p_query_embedding: embedding ? "[" + embedding.join(",") + "]" : null,
      p_category_id: categoryId, p_min_price: minPrice, p_max_price: maxPrice,
      p_in_stock: inStock, p_sort: sort, p_limit: limit, p_offset: offset
    });
    if (error) { console.error("Smart search RPC failed:", error.message); return json({ error: "সার্চ করা যায়নি। ডাটাবেস Migration প্রয়োগ হয়েছে কি না যাচাই করুন।" }, 503); }
    return json({ data: data ?? [], page, limit, ai: { used: aiUsed, mode: aiUsed ? "hybrid" : "keyword" } });
  } catch (error) { console.error("Smart search failed:", error); return json({ error: "সার্চ সেবায় সাময়িক সমস্যা হয়েছে।" }, 500); }
}