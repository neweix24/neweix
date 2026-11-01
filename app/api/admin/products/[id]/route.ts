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

/**
 * Compare primitive values, arrays and nested JSON objects.
 * Object key order does not affect equality.
 */
function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }

    return a.every((value, index) => areValuesEqual(value, b[index]));
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord).sort();
  const bKeys = Object.keys(bRecord).sort();

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key, index) =>
      key === bKeys[index] &&
      areValuesEqual(aRecord[key], bRecord[key])
  );
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
    return { response: jsonError("Authentication required.", 401) };
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
      response: jsonError("You are not authorized to change products or stock.", 403),
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
          "Complete MFA verification for the Supreme account.",
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
      return jsonError("Product ID is invalid.", 400);
    }

    const contentLength = request.headers.get("content-length");

    if (
      contentLength !== null &&
      (!/^\d+$/.test(contentLength) ||
        Number(contentLength) > MAX_BODY_BYTES)
    ) {
      return jsonError("Request is too large or invalid.", 413);
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonError("Request is too large.", 413);
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError("Provide valid JSON.", 400);
    }

    if (!isRecord(body)) {
      return jsonError("Product information is invalid.", 400);
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
        "An empty or unauthorized field was submitted.",
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
          return jsonError("Product name is invalid.", 400);
        }

        update.name = value.trim();
      } else if (key === "slug") {
        if (
          typeof value !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
          value.length > 200
        ) {
          return jsonError(
            "Slug must use lowercase English letters, numbers, and hyphens.",
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
          return jsonError("Description is invalid.", 400);
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
          return jsonError("Price is invalid.", 400);
        }

        if (key === "price" && value === null) {
          return jsonError("Price is required.", 400);
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
          return jsonError(`${key} is invalid.`, 400);
        }

        update[key] = value;
      } else if (key === "sku") {
        if (
          value !== null &&
          (typeof value !== "string" ||
            value.trim().length > 100)
        ) {
          return jsonError("SKU is invalid.", 400);
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
          return jsonError(`${key} is invalid.`, 400);
        }

        update[key] = value;
      } else if (key === "category_id") {
        if (
          value !== null &&
          (typeof value !== "string" ||
            !UUID_REGEX.test(value))
        ) {
          return jsonError("Category ID is invalid.", 400);
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
          return jsonError("Image URL list is invalid.", 400);
        }

        update.image_urls = value;
      } else if (key === "video_url") {
        if (
          value !== null &&
          (typeof value !== "string" ||
            value.length > 2048 ||
            !isHttpsUrl(value))
        ) {
          return jsonError("Video URL is invalid.", 400);
        }

        update.video_url = value;
      } else if (key === "variants") {
        if (
          !Array.isArray(value) ||
          value.length > MAX_ITEMS ||
          value.some((item) => !isRecord(item))
        ) {
          return jsonError(
            "Variants must be an array of valid JSON objects.",
            400
          );
        }

        update.variants = value;
      }
    }

    const supabase = await getAdminClient();

    const productSelect =
      "id, name, slug, description, price, compare_at_price, stock, sku, category_id, image_urls, video_url, variants, is_active, is_featured, low_stock_threshold, weight_grams, updated_at";

    // Read the existing values before deciding what actually changed.
    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select(productSelect)
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Product lookup before update failed:",
        existingError.message
      );
      return jsonError("Could not verify the current product information.", 500);
    }

    if (!existing) {
      return jsonError("Product not found.", 404);
    }

    const existingRecord =
      existing as unknown as Record<string, unknown>;

    const changedFields = Object.keys(update).filter(
      (key) => !areValuesEqual(existingRecord[key], update[key])
    );

    // No values changed: don't update the row or write a redundant audit entry.
    if (changedFields.length === 0) {
      return NextResponse.json(
        { success: true, product: existing },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const changedUpdate = Object.fromEntries(
      changedFields.map((key) => [key, update[key]])
    );

    const { data, error } = await supabase
      .from("products")
      .update(changedUpdate)
      .eq("id", id)
      .select(productSelect)
      .maybeSingle();

    if (error) {
      console.error("Product update failed:", error.message);

      if (error.code === "23505") {
        return jsonError(
          "This slug or SKU already exists.",
          409
        );
      }

      if (error.code === "23503") {
        return jsonError(
          "Selected Category ID was not found.",
          400
        );
      }

      return jsonError("Could not update the product.", 500);
    }

    if (!data) {
      return jsonError("Product not found.", 404);
    }

    try {
      await writeAuditLog(supabase, {
        actorId: auth.userId,
        action: "product.updated",
        targetType: "product",
        targetId: String(data.id),
        details: {
          changedFields,
          stock: data.stock,
          name: data.name,
        },
      });
    } catch {
      console.error("Audit log missing for product update:", {
        actorId: auth.userId,
        productId: data.id,
        changedFields,
      });
    }

    return NextResponse.json(
      { success: true, product: data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Product PATCH error:", error);

    return jsonError("A server error occurred.", 500);
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