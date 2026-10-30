import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type AiBinding = { run(model: string, input: { text: string[] }): Promise<{ data?: number[][] }> };
function reply(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
 try {
  const staff = await getCurrentStaff();
  if (!staff) return reply({ error: "লগইন আবশ্যক।" }, 401);
  if (staff.mfaRequired) return reply({ error: "Supreme অ্যাকাউন্টের MFA যাচাই সম্পন্ন করুন।" }, 403);
  if (staff.role !== "supreme" && staff.role !== "admin") return reply({ error: "এই কাজের অনুমতি নেই।" }, 403);
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return reply({ error: "অনুরোধের উৎস যাচাই করা যায়নি।" }, 403);
  let body: unknown = {}; try { body = await request.json(); } catch { return reply({ error: "সঠিক JSON পাঠান।" }, 400); }
  const values = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const offset = Number.isSafeInteger(values.offset) && Number(values.offset) >= 0 ? Number(values.offset) : 0;
  const limit = Number.isSafeInteger(values.limit) ? Math.min(20, Math.max(1, Number(values.limit))) : 10;
  const context = await getCloudflareContext();
  const env = context.env as unknown as Record<string, unknown>;
  const ai = env.AI as AiBinding | undefined;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ai || typeof ai.run !== "function" || typeof supabaseUrl !== "string" || typeof serviceKey !== "string") return reply({ error: "AI অথবা সার্ভার ডাটাবেস কনফিগারেশন পাওয়া যায়নি।" }, 503);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: products, error } = await supabase.from("products").select("id,name,description,sku").eq("is_active", true).order("id").range(offset, offset + limit - 1);
  if (error) { console.error("Search reindex fetch failed:", error.message); return reply({ error: "পণ্য লোড করা যায়নি।" }, 500); }
  if (!products?.length) return reply({ indexed: 0, nextOffset: null, complete: true });
  const texts = products.map(p => [p.name, p.sku ? "SKU " + p.sku : "", p.description ?? ""].filter(Boolean).join(". ").slice(0, 2000));
  const result = await ai.run("@cf/baai/bge-m3", { text: texts });
  if (!Array.isArray(result.data) || result.data.length !== products.length || result.data.some(v => !Array.isArray(v) || v.length !== 1024 || !v.every(Number.isFinite))) return reply({ error: "AI থেকে সঠিক Embedding পাওয়া যায়নি।" }, 502);
  let indexed = 0;
  for (let i = 0; i < products.length; i++) {
   const vector = result.data[i];
   const { error: updateError } = await supabase.from("products").update({ search_embedding: "[" + vector.join(",") + "]", search_embedding_model: "@cf/baai/bge-m3", search_embedding_updated_at: new Date().toISOString() }).eq("id", products[i].id);
   if (updateError) { console.error("Product embedding update failed:", updateError.message); return reply({ indexed, failedProductId: products[i].id, error: "কিছু পণ্যের Embedding সংরক্ষণ করা যায়নি। একই offset থেকে পুনরায় চালান।" }, 500); }
   indexed++;
  }
  const nextOffset = products.length === limit ? offset + indexed : null;
  return reply({ indexed, nextOffset, complete: nextOffset === null, model: "@cf/baai/bge-m3" });
 } catch (error) { console.error("Search reindex failed:", error); return reply({ error: "Embedding তৈরি করা যায়নি।" }, 500); }
}