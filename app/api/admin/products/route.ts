import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_PRICE = 1_000_000_000;
const MAX_ITEMS = 50;
const MAX_IMAGES = 10;

type StaffContext =
  | {
      error: string;
      status: 401 | 403;
    }
  | {
      session: Awaited<ReturnType<typeof createServerSupabaseClient>>;
      user: { id: string };
      role: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }

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

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

async function getStaffContext(): Promise<StaffContext> {
  const session = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await session.auth.getUser();

  if (userError || !user) {
    return { error: "Authentication required.", status: 401 };
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
    !["supreme", "admin", "staff"].includes(profile.role)
  ) {
    return { error: "You are not authorized to perform this action.", status: 403 };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } =
      await session.auth.mfa.getAuthenticatorAssuranceLevel();

    if (mfaError || assurance?.currentLevel !== "aal2") {
      return {
        error: "Complete MFA verification for the Supreme account.",
        status: 403,
      };
    }
  }

  return {
    session,
    user,
    role: profile.role,
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

const PRODUCT_COLUMNS =
  "id, name, slug, description, price, compare_at_price, image_urls, stock, category_id, video_url, variants, sku, is_active, is_featured, weight_grams, low_stock_threshold, created_at, updated_at";

const STAFF_PRODUCT_COLUMNS =
  "id, name, slug, stock, low_stock_threshold";

export async function GET() {
  try {
    const staff = await getStaffContext();

    if ("error" in staff) {
      return errorResponse(staff.error, staff.status);
    }

    const supabase = await getAdminClient();

    // Staff receives only product identity and stock-related fields.
    const columns =
      staff.role === "staff"
        ? STAFF_PRODUCT_COLUMNS
        : PRODUCT_COLUMNS;

    const { data, error } = await supabase
      .from("products")
      .select(columns)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin products GET failed:", error.message);
      return errorResponse("Could not load the product list.", 500);
    }

    return NextResponse.json(
      { success: true, products: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin products GET error:", error);
    return errorResponse("A server error occurred.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext();

    if ("error" in staff) {
      return errorResponse(staff.error, staff.status);
    }

    if (!["supreme", "admin"].includes(staff.role)) {
      return errorResponse("You are not authorized to add products.", 403);
    }

    const contentLength = request.headers.get("content-length");

    if (contentLength !== null) {
      const size = Number(contentLength);

      if (!Number.isSafeInteger(size) || size < 0) {
        return errorResponse("Request size is invalid.", 400);
      }

      if (size > MAX_BODY_BYTES) {
        return errorResponse("Request is too large.", 413);
      }
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return errorResponse("Request is too large.", 413);
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return errorResponse("Provide valid JSON data.", 400);
    }

    if (!isRecord(body)) {
      return errorResponse("Product information is invalid.", 400);
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    const price = body.price;
    const stock = body.stock;
    const compareAtPrice = body.compare_at_price ?? null;
    const weightGrams = body.weight_grams ?? 500;
    const lowStockThreshold = body.low_stock_threshold ?? 5;

    if (!name || name.length > 200) {
      return errorResponse("Provide a product name (maximum 200 characters).", 400);
    }

    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 200
    ) {
      return errorResponse(
        "Slug must use lowercase English letters, numbers, and hyphens.",
        400
      );
    }

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > MAX_PRICE
    ) {
      return errorResponse(
        "Product price must be between 0 and 1,000,000,000.",
        400
      );
    }

    if (
      typeof stock !== "number" ||
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      stock > 1_000_000
    ) {
      return errorResponse(
        "Stock quantity must be between 0 and 1,000,000.",
        400
      );
    }

    if (
      description.length > 10000 ||
      (compareAtPrice !== null &&
        (typeof compareAtPrice !== "number" ||
          !Number.isFinite(compareAtPrice) ||
          compareAtPrice < 0 ||
          compareAtPrice > MAX_PRICE)) ||
      typeof weightGrams !== "number" ||
      !Number.isSafeInteger(weightGrams) ||
      weightGrams < 1 ||
      weightGrams > 1_000_000 ||
      typeof lowStockThreshold !== "number" ||
      !Number.isSafeInteger(lowStockThreshold) ||
      lowStockThreshold < 0 ||
      lowStockThreshold > 1_000_000
    ) {
      return errorResponse("Additional product information is invalid.", 400);
    }

    const imageUrls = body.image_urls ?? [];

    if (
      !Array.isArray(imageUrls) ||
      imageUrls.length > MAX_IMAGES ||
      !imageUrls.every(isHttpsUrl)
    ) {
      return errorResponse(
        "Provide up to 10 valid HTTPS image URLs.",
        400
      );
    }

    const variants = body.variants ?? [];

    if (
      !Array.isArray(variants) ||
      variants.length > MAX_ITEMS ||
      !variants.every(isRecord)
    ) {
      return errorResponse("Variant information is invalid.", 400);
    }

    const isActive = body.is_active ?? false;
    const isFeatured = body.is_featured ?? false;

    if (
      typeof isActive !== "boolean" ||
      typeof isFeatured !== "boolean"
    ) {
      return errorResponse("Product active status is invalid.", 400);
    }

    const categoryId = body.category_id ?? null;

    if (categoryId !== null && !isUuid(categoryId)) {
      return errorResponse("Category ID is invalid.", 400);
    }

    const sku =
      body.sku == null
        ? null
        : typeof body.sku === "string"
          ? body.sku.trim() || null
          : undefined;

    const rawVideoUrl = body.video_url ?? null;
    const videoUrl =
      rawVideoUrl === null
        ? null
        : typeof rawVideoUrl === "string"
          ? rawVideoUrl.trim() || null
          : undefined;

    if (
      sku === undefined ||
      (sku !== null && sku.length > 100) ||
      videoUrl === undefined ||
      (videoUrl !== null && !isHttpsUrl(videoUrl))
    ) {
      return errorResponse("SKU or video URL is invalid.", 400);
    }

    const supabase = await getAdminClient();

    const { data, error } = await supabase
      .from("products")
      .insert({
        name,
        slug,
        description,
        price,
        compare_at_price: compareAtPrice,
        image_urls: imageUrls,
        stock,
        category_id: categoryId,
        video_url: videoUrl,
        variants,
        sku,
        is_active: isActive,
        is_featured: isFeatured,
        weight_grams: weightGrams,
        low_stock_threshold: lowStockThreshold,
      })
      .select(PRODUCT_COLUMNS)
      .single();

    if (error) {
      console.error("Admin product create failed:", error.message);

      if (error.code === "23505") {
        return errorResponse(
          "This slug or SKU is already in use.",
          409
        );
      }

      if (error.code === "23503") {
        return errorResponse(
          "Selected category was not found in the database.",
          400
        );
      }

      return errorResponse("Could not create the product.", 500);
    }

    try {
      await writeAuditLog(supabase, {
        actorId: staff.user.id,
        action: "product.created",
        targetType: "product",
        targetId: String(data.id),
        details: {
          name: data.name,
          slug: data.slug,
          stock: data.stock,
        },
      });
    } catch {
      console.error("Audit log missing for product creation:", {
        actorId: staff.user.id,
        productId: data.id,
      });
    }

    return NextResponse.json(
      { success: true, product: data },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Admin product POST error:", error);
    return errorResponse("A server error occurred.", 500);
  }
}