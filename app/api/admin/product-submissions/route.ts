import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_PRICE = 1_000_000_000;
const MAX_IMAGES = 10;
const MAX_ITEMS = 50;

type StaffContext =
  | { error: string; status: 401 | 403 }
  | {
      session: Awaited<ReturnType<typeof createServerSupabaseClient>>;
      user: { id: string };
      role: "supreme" | "admin" | "staff";
    };

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

async function getStaffContext(): Promise<StaffContext> {
  const session = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await session.auth.getUser();

  if (authError || !user) {
    return { error: "লগইন আবশ্যক।", status: 401 };
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
    return { error: "এই কাজের অনুমতি নেই।", status: 403 };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } =
      await session.auth.mfa.getAuthenticatorAssuranceLevel();

    if (mfaError || assurance?.currentLevel !== "aal2") {
      return {
        error: "Supreme অ্যাকাউন্টের MFA যাচাই সম্পন্ন করুন।",
        status: 403,
      };
    }
  }

  return {
    session,
    user,
    role: profile.role as "supreme" | "admin" | "staff",
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
    typeof url !== "string" || !url ||
    typeof key !== "string" || !key
  ) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  try {
    const staff = await getStaffContext();

    if ("error" in staff) {
      return jsonError(staff.error, staff.status);
    }

    const supabase = await getAdminClient();

    let query = supabase
      .from("product_submissions")
      .select(
        "id, submitted_by, product_data, status, review_note, reviewed_by, reviewed_at, created_product_id, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    // Staff may view only their own submissions.
    if (staff.role === "staff") {
      query = query.eq("submitted_by", staff.user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Product submissions GET failed:", error.message);
      return jsonError("জমা দেওয়া পণ্যের তালিকা আনা যায়নি।", 500);
    }

    return NextResponse.json(
      { success: true, submissions: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Product submissions GET error:", error);
    return jsonError("সার্ভারে সমস্যা হয়েছে।", 500);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext();

    if ("error" in staff) {
      return jsonError(staff.error, staff.status);
    }

    const contentLength = request.headers.get("content-length");

    if (contentLength !== null) {
      const size = Number(contentLength);

      if (!Number.isSafeInteger(size) || size < 0) {
        return jsonError("অনুরোধের আকার সঠিক নয়।", 400);
      }

      if (size > MAX_BODY_BYTES) {
        return jsonError("অনুরোধটি অনেক বড়।", 413);
      }
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonError("অনুরোধটি অনেক বড়।", 413);
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError("সঠিক JSON তথ্য পাঠান।", 400);
    }

    if (!isRecord(body)) {
      return jsonError("পণ্যের তথ্য সঠিক নয়।", 400);
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
    const imageUrls = body.image_urls ?? [];
    const variants = body.variants ?? [];
    const categoryId = body.category_id ?? null;
    const sku =
      body.sku == null
        ? null
        : typeof body.sku === "string"
          ? body.sku.trim() || null
          : undefined;
    const videoUrl =
      body.video_url == null
        ? null
        : typeof body.video_url === "string"
          ? body.video_url.trim() || null
          : undefined;
    const isActive = body.is_active ?? false;
    const isFeatured = body.is_featured ?? false;

    if (!name || name.length > 200) {
      return jsonError("পণ্যের নাম দিন (সর্বোচ্চ ২০০ অক্ষর)।", 400);
    }

    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 200
    ) {
      return jsonError(
        "Slug ইংরেজি ছোট অক্ষর, সংখ্যা ও হাইফেন দিয়ে লিখুন।",
        400
      );
    }

    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > MAX_PRICE
    ) {
      return jsonError("পণ্যের মূল্য সঠিক নয়।", 400);
    }

    if (
      typeof stock !== "number" ||
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      stock > 1_000_000
    ) {
      return jsonError("স্টকের পরিমাণ সঠিক নয়।", 400);
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
      return jsonError("পণ্যের অতিরিক্ত তথ্য সঠিক নয়।", 400);
    }

    if (
      !Array.isArray(imageUrls) ||
      imageUrls.length > MAX_IMAGES ||
      !imageUrls.every(isHttpsUrl)
    ) {
      return jsonError("সর্বোচ্চ ১০টি বৈধ HTTPS ছবির লিংক দিন।", 400);
    }

    if (
      !Array.isArray(variants) ||
      variants.length > MAX_ITEMS ||
      !variants.every(isRecord)
    ) {
      return jsonError("Variants-এর তথ্য সঠিক নয়।", 400);
    }

    if (
      typeof isActive !== "boolean" ||
      typeof isFeatured !== "boolean"
    ) {
      return jsonError("পণ্যের অবস্থা সঠিক নয়।", 400);
    }

    if (categoryId !== null && !isUuid(categoryId)) {
      return jsonError("Category ID সঠিক নয়।", 400);
    }

    if (
      sku === undefined ||
      (sku !== null && sku.length > 100) ||
      videoUrl === undefined ||
      (videoUrl !== null && !isHttpsUrl(videoUrl))
    ) {
      return jsonError("SKU অথবা ভিডিও URL সঠিক নয়।", 400);
    }

    const productData = {
      name,
      slug,
      description: description || null,
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
    };

    const supabase = await getAdminClient();

    // Important: never insert a staff submission directly into products.
    const { data, error } = await supabase
      .from("product_submissions")
      .insert({
        submitted_by: staff.user.id,
        product_data: productData,
        status: "pending",
      })
      .select(
        "id, submitted_by, product_data, status, created_at"
      )
      .single();

    if (error) {
      console.error("Product submission create failed:", error.message);
      return jsonError("পণ্য অনুমোদনের জন্য জমা দেওয়া যায়নি।", 500);
    }

    try {
      await writeAuditLog(supabase, {
        actorId: staff.user.id,
        action: "product.submitted_for_approval",
        targetType: "product_submission",
        targetId: String(data.id),
        details: {
          name,
          slug,
          submittedByRole: staff.role,
        },
      });
    } catch {
      console.error("Audit log missing for product submission:", {
        actorId: staff.user.id,
        submissionId: data.id,
      });
    }

    return NextResponse.json(
      {
        success: true,
        submission: data,
        message: "পণ্যটি অনুমোদনের জন্য জমা হয়েছে।",
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Product submissions POST error:", error);
    return jsonError("সার্ভারে সমস্যা হয়েছে।", 500);
  }
}
export async function PATCH(request: Request) {
  try {
    const staff = await getStaffContext();
    if ("error" in staff) return jsonError(staff.error, staff.status);
    if (staff.role === "staff") return jsonError("পণ্য প্রস্তাব অনুমোদন বা প্রত্যাখ্যান করার অনুমতি নেই।", 403);

    const contentLength = request.headers.get("content-length");
    if (contentLength && (!/^[0-9]+$/.test(contentLength) || Number(contentLength) > 4096)) {
      return jsonError("অনুরোধটি অনেক বড়।", 413);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return jsonError("অনুরোধটি অনেক বড়।", 413);

    let body: unknown;
    try { body = JSON.parse(raw); } catch { return jsonError("সঠিক JSON তথ্য পাঠান।", 400); }
    if (!isRecord(body)) return jsonError("সঠিক তথ্য পাঠান।", 400);

    const id = body.id;
    const decision = body.decision;
    const note = body.review_note == null ? null : typeof body.review_note === "string" ? body.review_note.trim() : undefined;

    if (!isUuid(id)) return jsonError("সঠিক Submission ID দিন।", 400);
    if (decision !== "approved" && decision !== "rejected") return jsonError("অনুমোদন অথবা প্রত্যাখ্যান নির্বাচন করুন।", 400);
    if (note === undefined || (note !== null && note.length > 1000)) return jsonError("পর্যালোচনা নোট সর্বোচ্চ ১০০০ অক্ষরের হতে হবে।", 400);

    const supabase = await getAdminClient();
    const { data, error } = await supabase.rpc("review_product_submission", {
      p_submission_id: id,
      p_reviewer_id: staff.user.id,
      p_decision: decision,
      p_review_note: note,
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("not found")) return jsonError("পণ্য প্রস্তাব পাওয়া যায়নি।", 404);
      if (message.includes("already been reviewed")) return jsonError("এই প্রস্তাব আগে পর্যালোচনা করা হয়েছে।", 409);
      console.error("Product submission review RPC failed:", error.message);
      return jsonError("পণ্য প্রস্তাব পর্যালোচনা করা যায়নি।", 500);
    }

    try {
      await writeAuditLog(supabase, {
        actorId: staff.user.id,
        action: decision === "approved" ? "product_submission.approved" : "product_submission.rejected",
        targetType: "product_submission",
        targetId: id,
        details: { decision, reviewNote: note },
      });
    } catch (auditError) {
      console.error("Product submission review audit failed:", auditError);
    }

    return NextResponse.json(
      { success: true, result: data, message: decision === "approved" ? "পণ্য অনুমোদিত হয়েছে।" : "পণ্য প্রস্তাব প্রত্যাখ্যান করা হয়েছে।" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Product submissions PATCH error:", error);
    return jsonError("সার্ভারে সমস্যা হয়েছে।", 500);
  }
}
