import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return reply({ error: "Authentication required." }, 401);
    if (staff.mfaRequired) {
      return reply({ error: "Complete MFA verification for the Supreme account." }, 403);
    }
    if (staff.role !== "supreme" && staff.role !== "admin") {
      return reply({ error: "You are not authorized to perform this action." }, 403);
    }

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return reply({ error: "Provide valid JSON." }, 400);
    }
    const values = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const offset = Number.isSafeInteger(values.offset) && Number(values.offset) >= 0
      ? Number(values.offset)
      : 0;
    const limit = Number.isSafeInteger(values.limit)
      ? Math.min(20, Math.max(1, Number(values.limit)))
      : 10;

    const context = await getCloudflareContext();
    const env = context.env as unknown as Record<string, unknown>;
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (typeof supabaseUrl !== "string" || typeof serviceKey !== "string") {
      return reply({ error: "Server database configuration is missing." }, 503);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("neweix_enqueue_search_embedding_batch", {
      p_offset: offset,
      p_limit: limit,
    });
    if (error) {
      console.error("Search reindex enqueue failed:", error.message);
      return reply({ error: "Could not enqueue the search reindex batch." }, 503);
    }

    const result = Array.isArray(data) ? data[0] : null;
    return reply({
      queued: Number(result?.queued ?? 0),
      nextOffset: result?.next_offset ?? null,
      complete: result?.complete === true,
      processing: "The scheduled Search Embedding Queue will generate and save embeddings.",
    });
  } catch (error) {
    console.error("Search reindex enqueue failed:", error);
    return reply({ error: "Could not enqueue the search reindex batch." }, 500);
  }
}
