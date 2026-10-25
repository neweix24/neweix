import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function authorizeAdmin() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error: authError } =
    await session.auth.getUser();

  if (authError || !user) {
    return { response: NextResponse.json(
      { error: "লগইন আবশ্যক।" }, { status: 401 }
    ) };
  }

  const { data: profile, error } = await session
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    error ||
    !profile ||
    profile.is_active !== true ||
    !["supreme", "admin"].includes(profile.role)
  ) {
    return { response: NextResponse.json(
      { error: "পণ্য বা স্টক পরিবর্তনের অনুমতি নেই।" },
      { status: 403 }
    ) };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } =
      await session.auth.mfa.getAuthenticatorAssuranceLevel();

    if (mfaError || assurance.currentLevel !== "aal2") {
      return { response: NextResponse.json(
        { error: "Supreme অ্যাকাউন্টের MFA যাচাই করুন।" },
        { status: 403 }
      ) };
    }
  }

  return { session, role: profile.role };
}

async function getAdminClient() {
  const { env } = await getCloudflareContext();
  const runtimeEnv = env as Record<string, unknown>;

  const url =
    runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    typeof url !== "string" || !url ||
    typeof key !== "string" || !key
  ) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const auth = await authorizeAdmin();

    if ("response" in auth) {
      return auth.response;
    }

    const { id } = await context.params;

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: "পণ্যের ID সঠিক নয়।" },
        { status: 400 }
      );
    }

    const contentLength = request.headers.get("content-length");

    if (contentLength && Number(contentLength) > 16 * 1024) {
      return NextResponse.json(
        { error: "অনুরোধটি অনেক বড়।" },
        { status: 413 }
      );
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > 16 * 1024) {
      return NextResponse.json(
        { error: "অনুরোধটি অনেক বড়।" },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "সঠিক JSON পাঠান।" },
        { status: 400 }
      );
    }

    if (!isRecord(body)) {
      return NextResponse.json(
        { error: "পণ্যের তথ্য সঠিক নয়।" },
        { status: 400 }
      );
    }

    const allowed = [
      "name",
      "slug",
      "description",
      "price",
      "compare_at_price",
      "stock",
      "sku",
      "is_active",
      "is_featured",
      "low_stock_threshold",
      "weight_grams",
    ];

    const keys = Object.keys(body);

    if (keys.length === 0 || keys.some((key) => !allowed.includes(key))) {
      return NextResponse.json(
        { error: "ফাঁকা বা অনুমোদনহীন ফিল্ড পাঠানো হয়েছে।" },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};

    for (const key of keys) {
      const value = body[key];

      if (key === "name") {
        if (typeof value !== "string" || !value.trim() || value.trim().length > 200) {
          return NextResponse.json({ error: "পণ্যের নাম সঠিক নয়।" }, { status: 400 });
        }
        update.name = value.trim();
      } else if (key === "slug") {
        if (
          typeof value !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
          value.length > 200
        ) {
          return NextResponse.json({ error: "Slug সঠিক নয়।" }, { status: 400 });
        }
        update.slug = value;
      } else if (key === "description") {
        if (value !== null && (typeof value !== "string" || value.length > 10000)) {
          return NextResponse.json({ error: "বিবরণ সঠিক নয়।" }, { status: 400 });
        }
        update.description = value;
      } else if (key === "price" || key === "compare_at_price") {
        if (
          value !== null &&
          (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        ) {
          return NextResponse.json({ error: "মূল্য সঠিক নয়।" }, { status: 400 });
        }
        update[key] = value;
      } else if (
        key === "stock" ||
        key === "low_stock_threshold" ||
        key === "weight_grams"
      ) {
        const min = key === "weight_grams" ? 1 : 0;
        if (
          typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < min ||
          value > 1000000
        ) {
          return NextResponse.json({ error: `${key} সঠিক নয়।` }, { status: 400 });
        }
        update[key] = value;
      } else if (key === "sku") {
        if (value !== null && (typeof value !== "string" || value.trim().length > 100)) {
          return NextResponse.json({ error: "SKU সঠিক নয়।" }, { status: 400 });
        }
        update.sku = typeof value === "string" ? value.trim() || null : null;
      } else if (key === "is_active" || key === "is_featured") {
        if (typeof value !== "boolean") {
          return NextResponse.json({ error: `${key} সঠিক নয়।` }, { status: 400 });
        }
        update[key] = value;
      }
    }

    const supabase = await getAdminClient();

    const { data, error } = await supabase
      .from("products")
      .update(update)
      .eq("id", id)
      .select("id, name, slug, price, compare_at_price, stock, sku, is_active, is_featured, low_stock_threshold, weight_grams, updated_at")
      .maybeSingle();

    if (error) {
      console.error("Product update failed:", error.message);

      if (error.code === "23505") {
        return NextResponse.json(
          { error: "এই Slug বা SKU আগে থেকেই আছে।" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "পণ্য আপডেট করা যায়নি।" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "পণ্যটি পাওয়া যায়নি।" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, product: data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Product PATCH error:", error);

    return NextResponse.json(
      { error: "সার্ভারে সমস্যা হয়েছে।" },
      { status: 500 }
    );
  }
}