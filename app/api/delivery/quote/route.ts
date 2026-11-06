import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { calculatePathaoPrice, getPathaoStoreId } from "@/lib/pathao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractFinalPrice(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const first = record.data;
  const firstRecord = first && typeof first === "object" ? first as Record<string, unknown> : null;
  const second = firstRecord?.data;
  const secondRecord = second && typeof second === "object" ? second as Record<string, unknown> : null;
  const value = secondRecord?.final_price ?? firstRecord?.final_price ?? record.final_price;
  const fee = Number(value);
  return Number.isFinite(fee) && fee >= 0 ? Math.round(fee) : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const districtCode = (searchParams.get("district_code") || "").trim();
  const upazilaCode = (searchParams.get("upazila_code") || "").trim();
  const rawPathaoAreaId = (searchParams.get("pathao_area_id") || "").trim();
  const pathaoAreaId = rawPathaoAreaId ? Number(rawPathaoAreaId) : null;
  const couponCode = (searchParams.get("coupon_code") || "").trim().toUpperCase();
  let items: Array<{ product_id: string; quantity: number }>;

  try {
    const parsed: unknown = JSON.parse(searchParams.get("items") || "null");
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50) throw new Error();
    items = parsed.map((item) => {
      if (!item || typeof item !== "object") throw new Error();
      const row = item as Record<string, unknown>;
      if (typeof row.product_id !== "string" || !UUID_REGEX.test(row.product_id) ||
          typeof row.quantity !== "number" || !Number.isSafeInteger(row.quantity) ||
          row.quantity < 1 || row.quantity > 100) throw new Error();
      return { product_id: row.product_id.toLowerCase(), quantity: row.quantity };
    });
    if (new Set(items.map((item) => item.product_id)).size !== items.length) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid cart details." }, { status: 400 });
  }

  if (!/^BD-D[0-9]{2}-Z[0-9]{2}$/.test(districtCode) ||
      !/^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$/.test(upazilaCode) ||
      (rawPathaoAreaId && (pathaoAreaId === null || !Number.isSafeInteger(pathaoAreaId) || pathaoAreaId < 1)) ||
      (couponCode && !/^[A-Z0-9_-]{3,40}$/.test(couponCode))) {
    return NextResponse.json({ error: "Select a supported district and upazila." }, { status: 400 });
  }

  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, unknown>;
    const url = typeof runtimeEnv.NEXT_PUBLIC_SUPABASE_URL === "string"
      ? runtimeEnv.NEXT_PUBLIC_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = typeof runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === "string"
      ? runtimeEnv.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase configuration missing.");

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: mapping, error: mappingError } = await supabase
      .from("pathao_location_mappings")
      .select("id, pathao_city_id, pathao_zone_id")
      .eq("district_code", districtCode)
      .eq("upazila_code", upazilaCode)
      .eq("is_verified", true)
      .eq("is_active", true)
      .maybeSingle();

    if (mappingError) throw mappingError;
    if (!mapping) {
      return NextResponse.json({
        error: "Pathao delivery is not yet available for this upazila. Please contact support or choose another listed area.",
      }, { status: 422 });
    }

    let area: { pathao_area_id: number; pathao_area_name: string } | null = null;
    if (pathaoAreaId !== null) {
      const { data, error: areaError } = await supabase
        .from("pathao_area_catalog")
        .select("pathao_area_id, pathao_area_name, home_delivery_available")
        .eq("pathao_city_id", mapping.pathao_city_id)
        .eq("pathao_zone_id", mapping.pathao_zone_id)
        .eq("pathao_area_id", pathaoAreaId)
        .eq("is_active", true)
        .eq("home_delivery_available", true)
        .maybeSingle();
      if (areaError) throw areaError;
      if (!data) {
        return NextResponse.json({ error: "The selected Pathao Area is not available for home delivery in this upazila." }, { status: 422 });
      }
      area = data;
    }

    const productIds = items.map((item) => item.product_id);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, weight_grams, stock, is_active, price")
      .in("id", productIds);
    if (productsError) throw productsError;
    if (!products || products.length !== items.length ||
        products.some((product) => product.is_active !== true)) {
      return NextResponse.json({ error: "One or more cart products are unavailable." }, { status: 409 });
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    let totalWeightGrams = 0;
    let trustedSubtotal = 0;
    for (const item of items) {
      const product = productById.get(item.product_id);
      if (!product || Number(product.stock) < item.quantity) {
        return NextResponse.json({ error: "A cart product has insufficient stock." }, { status: 409 });
      }
      const grams = Number(product.weight_grams);
      const unitPrice = Number(product.price);
      if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ error: "A cart product has an invalid price." }, { status: 409 });
      }
      trustedSubtotal += unitPrice * item.quantity;
      if (!Number.isSafeInteger(trustedSubtotal)) {
        return NextResponse.json({ error: "Cart subtotal is outside the supported range." }, { status: 422 });
      }
      if (!Number.isSafeInteger(grams) || grams < 1) {
        return NextResponse.json({ error: "A product is missing a valid shipping weight." }, { status: 422 });
      }
      totalWeightGrams += grams * item.quantity;
    }

    if (totalWeightGrams > 10_000) {
      return NextResponse.json({ error: "Pathao supports parcels up to 10 kg." }, { status: 422 });
    }
    const itemWeightKg = Math.max(0.5, Math.ceil(totalWeightGrams / 500) * 0.5);
    const [storeId, settingsResult] = await Promise.all([
      getPathaoStoreId(),
      supabase.from("shop_settings").select("key,value").eq("key", "free_delivery_threshold"),
    ]);
    if (settingsResult.error) throw settingsResult.error;
    const threshold = Math.max(0, Number(settingsResult.data?.[0]?.value ?? 0));
    let freeShippingCoupon = false;
    if (couponCode) {
      const { data: coupon, error: couponError } = await supabase
        .from("coupons")
        .select("is_active, starts_at, expires_at, usage_limit, usage_count, min_subtotal, discount_type")
        .eq("code", couponCode)
        .maybeSingle();
      if (couponError) throw couponError;
      const now = Date.now();
      freeShippingCoupon = Boolean(
        coupon?.is_active === true &&
        coupon.discount_type === "free_shipping" &&
        trustedSubtotal >= Number(coupon.min_subtotal ?? 0) &&
        (!coupon.starts_at || new Date(coupon.starts_at).getTime() <= now) &&
        (!coupon.expires_at || new Date(coupon.expires_at).getTime() > now) &&
        (coupon.usage_limit == null || Number(coupon.usage_count) < Number(coupon.usage_limit))
      );
    }
    const freeDelivery = (threshold > 0 && trustedSubtotal >= threshold) || freeShippingCoupon;

    const rawQuote = await calculatePathaoPrice({
      storeId,
      itemType: 2,
      deliveryType: 48,
      itemWeightKg,
      recipientCity: Number(mapping.pathao_city_id),
      recipientZone: Number(mapping.pathao_zone_id),
    });
    const courierFee = extractFinalPrice(rawQuote);
    if (courierFee === null) {
      console.error("Pathao returned an unrecognized price-plan response.");
      return NextResponse.json({ error: "Pathao returned an invalid delivery quote. Please try again." }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      delivery_fee: freeDelivery ? 0 : courierFee,
      courier_fee: courierFee,
      free_delivery: freeDelivery,
      currency: "BDT",
      quote_source: "pathao",
      pathao_area_id: area?.pathao_area_id ?? null,
      pathao_area_name: area?.pathao_area_name ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const referenceId = crypto.randomUUID();
    const providerMessage = error instanceof Error ? error.message : "Unknown error";
    const diagnosticCode =
      /PATHAO_STORE_ID/i.test(providerMessage) ? "PATHAO_STORE_ID_CONFIGURATION" :
      /credentials|PATHAO_BASE_URL/i.test(providerMessage) ? "PATHAO_CREDENTIAL_CONFIGURATION" :
      /Pathao API \(401|403\)/i.test(providerMessage) ? "PATHAO_AUTHORIZATION_FAILED" :
      /Pathao API \(5[0-9]{2}\)/i.test(providerMessage) ? "PATHAO_PROVIDER_UNAVAILABLE" :
      /Pathao API \([45][0-9]{2}\)/i.test(providerMessage) ? "PATHAO_PROVIDER_REQUEST_REJECTED" :
      /Supabase configuration/i.test(providerMessage) ? "SUPABASE_CONFIGURATION" :
      "DELIVERY_QUOTE_INTERNAL_ERROR";

    // Keep provider details in server logs only; never return credentials or raw API errors.
    console.error(JSON.stringify({
      event: "live_pathao_delivery_quote_failed",
      referenceId,
      diagnosticCode,
      message: providerMessage.slice(0, 500),
    }));
    return NextResponse.json({
      error: "Live Pathao delivery pricing is temporarily unavailable. Please try again later.",
      diagnostic_code: diagnosticCode,
      reference_id: referenceId,
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
