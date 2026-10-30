import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type AiBinding = { run(model: string, input: { text: string[] }): Promise<{ data?: number[][] }> };
type SearchProduct = { id: string; name: string; sku: string | null; description: string | null; is_active: boolean };
function reply(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
 try {
  const origin = request.headers.get("origin"); const host = request.headers.get("host");
  if (origin && host) { try { if (new URL(origin).host !== host) return reply({ error: "অনুরোধের উৎস যাচাই করা যায়নি।" }, 403); } catch { return reply({ error: "অনুরোধের উৎস সঠিক নয়।" }, 403); } }
  const session = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return reply({ error: "লগইন আবশ্যক।" }, 401);
  const { data: profile, error: profileError } = await session.from("staff_profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || profile.is_active !== true || !["supreme","admin"].includes(profile.role)) return reply({ error: "এই কাজের অনুমতি নেই।" }, 403);
  if (profile.role === "supreme") { const { data: assurance, error } = await session.auth.mfa.getAuthenticatorAssuranceLevel(); if (error || assurance?.currentLevel !== "aal2") return reply({ error: "Supreme অ্যাকাউন্টের MFA যাচাই সম্পন্ন করুন।" }, 403); }
  let body: unknown = {}; try { body = await request.json(); } catch { return reply({ error: "সঠিক JSON পাঠান।" }, 400); }
  const rawLimit = body && typeof body === "object" ? (body as Record<string, unknown>).limit : undefined;
  const limit = Number.isSafeInteger(rawLimit) ? Math.min(20, Math.max(1, Number(rawLimit))) : 10;
  const { env } = await getCloudflareContext(); const runtimeEnv = env as unknown as Record<string, unknown>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ai = runtimeEnv.AI as AiBinding | undefined;
  if (typeof url !== "string" || typeof serviceKey !== "string" || !ai || typeof ai.run !== "function") return reply({ error: "Cloudflare AI অথবা সার্ভার ডাটাবেস কনফিগারেশন পাওয়া যায়নি।" }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error: claimError } = await admin.rpc("neweix_claim_search_embedding_jobs", { p_limit: limit });
  if (claimError) { console.error("Search queue claim failed:", claimError.message); return reply({ error: "সার্চ কিউ নেওয়া যায়নি।" }, 503); }
  if (!Array.isArray(jobs) || jobs.length === 0) return reply({ processed: 0, indexed: 0, failed: 0, remaining: 0 });
  const ids = jobs.map((job: { product_id: string }) => job.product_id);
  const { data: products, error: productError } = await admin.from("products").select("id,name,description,sku,is_active").in("id", ids);
  if (productError) { console.error("Search queue product lookup failed:", productError.message); for (const job of jobs) await admin.rpc("neweix_fail_search_embedding_job", { p_job_id: job.job_id, p_error: productError.message }); return reply({ error: "পণ্যের তথ্য লোড করা যায়নি; কিউ পুনরায় চেষ্টা করবে।" }, 503); }
  const byId = new Map<string, SearchProduct>((products ?? []).map((product) => [product.id, product as unknown as SearchProduct]));
  const activeJobs = jobs.filter((job: { product_id: string }) => { const p = byId.get(job.product_id); return p?.is_active === true; });
  let indexed = 0; let failed = 0;
  for (const job of jobs) { if (!activeJobs.some((item: { job_id: string }) => item.job_id === job.job_id)) await admin.rpc("neweix_complete_search_embedding_job", { p_job_id: job.job_id }); }
  if (activeJobs.length) {
   const texts = activeJobs.map((job: { product_id: string }) => { const p = byId.get(job.product_id)!; return [p.name, p.sku ? "SKU " + p.sku : "", p.description ?? ""].filter(Boolean).join(". ").slice(0, 2000); });
   let vectors: number[][] | undefined;
   try { const result = await ai.run("@cf/baai/bge-m3", { text: texts }); vectors = result.data; } catch (error) { console.error("Search embedding model failed:", error); }
   if (!Array.isArray(vectors) || vectors.length !== activeJobs.length || vectors.some(v => !Array.isArray(v) || v.length !== 1024 || !v.every(Number.isFinite))) {
    for (const job of activeJobs) { await admin.rpc("neweix_fail_search_embedding_job", { p_job_id: job.job_id, p_error: "AI returned an invalid embedding response" }); failed++; }
   } else {
    for (let i = 0; i < activeJobs.length; i++) { const job = activeJobs[i]; const vector = vectors[i]; const { error } = await admin.from("products").update({ search_embedding: "[" + vector.join(",") + "]", search_embedding_model: "@cf/baai/bge-m3", search_embedding_updated_at: new Date().toISOString() }).eq("id", job.product_id).eq("is_active", true);
     if (error) { await admin.rpc("neweix_fail_search_embedding_job", { p_job_id: job.job_id, p_error: error.message }); failed++; } else { await admin.rpc("neweix_complete_search_embedding_job", { p_job_id: job.job_id }); indexed++; }
    }
   }
  }
  return reply({ processed: jobs.length, indexed, failed, remaining: "Run again until processed is 0", model: "@cf/baai/bge-m3" });
 } catch (error) { console.error("Search queue processor failed:", error); return reply({ error: "Embedding queue প্রক্রিয়া করা যায়নি।" }, 500); }
}