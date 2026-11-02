import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AiBinding = {
  run(model: string, input: { text: string[] }): Promise<{ data?: number[][] }>;
};
type SearchProduct = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  is_active: boolean;
};
type SearchQueueJob = {
  job_id: string;
  product_id: string;
  attempts: number;
  lease_token: string;
};

function reply(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return reply({ error: "Could not verify the request origin." }, 403);
        }
      } catch {
        return reply({ error: "Request origin is invalid." }, 403);
      }
    }

    const session = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return reply({ error: "Authentication required." }, 401);

    const { data: profile, error: profileError } = await session
      .from("staff_profiles")
      .select("role,is_active")
      .eq("user_id", user.id)
      .maybeSingle();
    if (
      profileError || !profile || profile.is_active !== true ||
      !["supreme", "admin"].includes(profile.role)
    ) {
      return reply({ error: "You are not authorized to perform this action." }, 403);
    }
    if (profile.role === "supreme") {
      const { data: assurance, error } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || assurance?.currentLevel !== "aal2") {
        return reply({ error: "Complete MFA verification for the Supreme account." }, 403);
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return reply({ error: "Provide valid JSON." }, 400);
    }
    const rawLimit = body && typeof body === "object"
      ? (body as Record<string, unknown>).limit
      : undefined;
    const limit = Number.isSafeInteger(rawLimit)
      ? Math.min(20, Math.max(1, Number(rawLimit)))
      : 10;

    const { env } = await getCloudflareContext();
    const runtimeEnv = env as unknown as Record<string, unknown>;
    const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ai = runtimeEnv.AI as AiBinding | undefined;
    if (
      typeof url !== "string" || typeof serviceKey !== "string" ||
      !ai || typeof ai.run !== "function"
    ) {
      return reply({ error: "Cloudflare AI or server database configuration is missing." }, 503);
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: gateToken, error: gateError } = await admin.rpc(
      "neweix_acquire_search_embedding_gate",
      { p_min_interval_seconds: 30, p_lease_seconds: 600 },
    );
    if (gateError) {
      console.error("Search queue rate gate failed:", gateError.message);
      return reply({ error: "Search queue rate control is temporarily unavailable." }, 503);
    }
    if (typeof gateToken !== "string") {
      return reply(
        { error: "A search batch is already running or was started recently. Try again in 30 seconds." },
        429,
        { "Retry-After": "30" },
      );
    }

    try {
      const { data: rawJobs, error: claimError } = await admin.rpc(
        "neweix_claim_search_embedding_jobs_v2",
        { p_limit: limit },
      );
      if (claimError) {
        console.error("Search queue claim failed:", claimError.message);
        return reply({ error: "Could not claim the search queue." }, 503);
      }
      const jobs = (Array.isArray(rawJobs) ? rawJobs : []) as SearchQueueJob[];
      if (jobs.length === 0) {
        return reply({ processed: 0, indexed: 0, failed: 0, remaining: 0 });
      }

      const ids = jobs.map((job) => job.product_id);
      const { data: products, error: productError } = await admin
        .from("products")
        .select("id,name,description,sku,is_active")
        .in("id", ids);
      if (productError) {
        console.error("Search queue product lookup failed:", productError.message);
        await Promise.all(jobs.map((job) =>
          admin.rpc("neweix_fail_search_embedding_job_v2", {
            p_job_id: job.job_id,
            p_lease_token: job.lease_token,
            p_error: productError.message,
          }),
        ));
        return reply({ error: "Could not load product information; the queue will retry." }, 503);
      }

      const byId = new Map<string, SearchProduct>(
        ((products ?? []) as SearchProduct[]).map((product) => [product.id, product]),
      );
      const activeJobs = jobs.filter((job) => byId.get(job.product_id)?.is_active === true);
      for (const job of jobs) {
        if (!activeJobs.some((active) => active.job_id === job.job_id)) {
          await admin.rpc("neweix_complete_search_embedding_job_v2", {
            p_job_id: job.job_id,
            p_lease_token: job.lease_token,
          });
        }
      }

      let indexed = 0;
      let failed = 0;
      if (activeJobs.length > 0) {
        const texts = activeJobs.map((job) => {
          const product = byId.get(job.product_id)!;
          return [
            product.name,
            product.sku ? `SKU ${product.sku}` : "",
            product.description ?? "",
          ].filter(Boolean).join(". ").slice(0, 2000);
        });

        let vectors: number[][] | undefined;
        try {
          const result = await ai.run("@cf/baai/bge-m3", { text: texts });
          vectors = result.data;
        } catch (error) {
          console.error("Search embedding model failed:", error);
        }

        if (
          !Array.isArray(vectors) ||
          vectors.length !== activeJobs.length ||
          vectors.some((vector) =>
            !Array.isArray(vector) || vector.length !== 1024 || !vector.every(Number.isFinite),
          )
        ) {
          for (const job of activeJobs) {
            await admin.rpc("neweix_fail_search_embedding_job_v2", {
              p_job_id: job.job_id,
              p_lease_token: job.lease_token,
              p_error: "AI returned an invalid embedding response",
            });
            failed += 1;
          }
        } else {
          for (let index = 0; index < activeJobs.length; index += 1) {
            const job = activeJobs[index];
            const vector = vectors[index];
            const { data: saved, error } = await admin.rpc("neweix_save_search_embedding", {
              p_job_id: job.job_id,
              p_product_id: job.product_id,
              p_lease_token: job.lease_token,
              p_embedding: `[${vector.join(",")}]`,
              p_model: "@cf/baai/bge-m3",
            });
            if (error) {
              await admin.rpc("neweix_fail_search_embedding_job_v2", {
                p_job_id: job.job_id,
                p_lease_token: job.lease_token,
                p_error: error.message,
              });
              failed += 1;
            } else if (saved === true) {
              indexed += 1;
            } else {
              // A newer lease or product edit superseded this worker.
              failed += 1;
            }
          }
        }
      }

      return reply({
        processed: jobs.length,
        indexed,
        failed,
        remaining: "Run again after the rate-limit interval until processed is 0",
        model: "@cf/baai/bge-m3",
      });
    } finally {
      const { error: releaseError } = await admin.rpc(
        "neweix_release_search_embedding_gate",
        { p_lease_token: gateToken },
      );
      if (releaseError) {
        console.error("Search queue rate gate release failed:", releaseError.message);
      }
    }
  } catch (error) {
    console.error("Search queue processor failed:", error);
    return reply({ error: "Could not process the embedding queue." }, 500);
  }
}
