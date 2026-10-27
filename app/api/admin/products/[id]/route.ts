import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_TEXT_LENGTH = 10000;
const MAX_ITEMS = 50;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

async function authorizeAdmin() {
  const session = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();

  if (authError || !user) {
    return { response: jsonError("লগইন আবশ্যক।", 401) };
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
    return {
      response: jsonError("পণ্য বা স্টক পরিবর্তনের অনুমতি নেই।", 403),
    };
  }

  if (profile.role === "supreme") {
    const {
      data: assurance,
      error: mfaError,
    } = await session.auth.mfa.getAuthenticatorAssuranceLevel();

    if (mfaError || assurance?.currentLevel !== "aal2") {
      return {
        response: jsonError(
          "Supreme অ্যাকাউন্টের MFA যাচাই করুন।",
          403
        ),
      };
    }
  }

  return {
    role: profile.role,
    userId: user.id,
  };
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
    typeof url !== "string" ||
    !url ||
    typeof key !== "string" ||
    !key
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
      return jsonError("পণ্যের ID সঠিক নয়।", 400);
    }

    const contentLength = request.headers.get("content-length");

    if (
      contentLength !== null &&
      (!/^\d+$/.test(contentLength) ||
        Number(contentLength) > MAX_BODY_BYTES)
    ) {
      return jsonError("অনুরোধটি অনেক বড় বা সঠিক নয়।", 413);
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonError("অনুরোধটি অনেক বড়।", 413);
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError("সঠিক JSON পাঠান।", 400);
    }

    if (!isRecord(body)) {
      return jsonError("পণ্যের তথ্য সঠিক নয়।", 400);
    }

    const allowed = new Set([
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
      "category_id",
      "image_urls",
      "video_url",
      "variants",
    ]);

    const keys = Object.keys(body);

    if (
      keys.length === 0 ||
      keys.some((key) => !allowed.has(key))
    ) {
      return jsonError(
        "ফাঁকা বা অনুমোদনহীন ফিল্ড পাঠানো হয়েছে।",
        400
      );
    }

    const update: Record<string, unknown> = {};

    for (const key of keys) {
      const value = body[key];

      if (key === "name") {
        if (
          typeof value !== "string" ||
          !value.trim() ||
          value.trim().length > 180
        ) {
          return jsonError("পণ্যের নাম সঠিক নয়।", 400);
        }

        update.name = value.trim();
      } else if (key === "slug") {
        if (
          typeof value !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
          value.length > 200
        ) {
          return jsonError(
            "Slug ইংরেজি ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন দিয়ে লিখুন।",
            400
          );
        }

        update.slug = value;
      } else if (key === "description") {
        if (
          value !== null &&
          (typeof value !== "string" ||
            value.length > MAX_TEXT_LENGTH)
        ) {
          return jsonError("বিবরণ সঠিক নয়।", 400);
        }

        update.description = value;
      } else if (
        key === "price" ||
        key === "compare_at_price"
      ) {
        if (
          value !== null &&
          (typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 1000000000)
        ) {
          return jsonError("মূল্য সঠিক নয়।", 400);
        }

        if (key === "price" && value === null) {
          return jsonError("মূল্য দেওয়া আবশ্যক।", 400);
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
          return jsonError(`${key} সঠিক নয়।`, 400);
        }

        update[key] = value;
      } else if (key === "sku") {
        if (
          value !== null &&
          (typeof value !== "string" ||
            value.trim().length > 100)
        ) {
          return jsonError("SKU সঠিক নয়।", 400);
        }

        update.sku =
          typeof value === "string"
            ? value.trim() || null
            : null;
      } else if (
        key === "is_active" ||
        key === "is_featured"
      ) {
        if (typeof value !== "boolean") {
          return jsonError(`${key} সঠিক নয়।`, 400);
        }

        update[key] = value;
      } else if (key === "category_id") {
        if (
          value !== null &&
          (typeof value !== "string" ||
            !UUID_REGEX.test(value))
        ) {
          return jsonError("Category ID সঠিক নয়।", 400);
        }

        update.category_id = value;
      } else if (key === "image_urls") {
        if (
          !Array.isArray(value) ||
          value.length > MAX_ITEMS ||
          !value.every(
            (item) =>
              typeof item === "string" &&
              item.length <= 2048 &&
              isHttpsUrl(item)
          )
        ) {
          return jsonError("ছবির URL তালিকা সঠিক নয়।", 400);
        }

        update.image_urls = value;
      } else if (key === "video_url") {
        if (
          value !== null &&
          (typeof value !== "string" ||
            value.length > 2048 ||
            !isHttpsUrl(value))
        ) {
          return jsonError("ভিডিও URL সঠিক নয়।", 400);
        }

        update.video_url = value;
      } else if (key === "variants") {
        if (
          !Array.isArray(value) ||
          value.length > MAX_ITEMS ||
          value.some((item) => !isRecord(item))
        ) {
          return jsonError(
            "Variants অবশ্যই বৈধ JSON object-এর array হতে হবে।",
            400
          );
        }

        update.variants = value;
      }
    }

    const supabase = await getAdminClient();

    const { data, error } = await supabase
      .from("products")
      .update(update)
      .eq("id", id)
      .select(
        "id, name, slug, description, price, compare_at_price, stock, sku, category_id, image_urls, video_url, variants, is_active, is_featured, low_stock_threshold, weight_grams, updated_at"
      )
      .maybeSingle();

    if (error) {
      console.error("Product update failed:", error.message);

      if (error.code === "23505") {
        return jsonError(
          "এই Slug বা SKU আগে থেকেই আছে।",
          409
        );
      }

      if (error.code === "23503") {
        return jsonError(
          "নির্বাচিত Category ID পাওয়া যায়নি।",
          400
        );
      }

      return jsonError("পণ্য আপডেট করা যায়নি।", 500);
    }

    if (!data) {
      return jsonError("পণ্যটি পাওয়া যায়নি।", 404);
    }

    try {
      await writeAuditLog(supabase, {
        actorId: auth.userId,
        action: "product.updated",
        targetType: "product",
        targetId: String(data.id),
        details: {
          changedFields: Object.keys(update),
          stock: data.stock,
          name: data.name,
        },
      });
    } catch {
      console.error("Audit log missing for product update:", {
        actorId: auth.userId,
        productId: data.id,
        changedFields: Object.keys(update),
      });
    }

    return NextResponse.json(
      { success: true, product: data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Product PATCH error:", error);

    return jsonError("সার্ভারে সমস্যা হয়েছে।", 500);
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}