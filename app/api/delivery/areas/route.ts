import { NextResponse } from "next/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISTRICT_CODE = /^BD-D[0-9]{2}-Z[0-9]{2}$/;
const UPAZILA_CODE = /^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const districtCode = (params.get("district_code") ?? "").trim();
  const upazilaCode = (params.get("upazila_code") ?? "").trim();

  if (!DISTRICT_CODE.test(districtCode) || !UPAZILA_CODE.test(upazilaCode) ||
      !upazilaCode.startsWith(`${districtCode}-`)) {
    return NextResponse.json({ error: "Select a valid district and upazila." }, { status: 400 });
  }

  try {
    const supabase = await createRuntimeServiceClient();
    const { data: mapping, error: mappingError } = await supabase
      .from("pathao_location_mappings")
      .select("pathao_city_id, pathao_zone_id")
      .eq("district_code", districtCode)
      .eq("upazila_code", upazilaCode)
      .eq("is_verified", true)
      .eq("is_active", true)
      .maybeSingle();

    if (mappingError) throw mappingError;
    if (!mapping) {
      return NextResponse.json({ success: true, areas: [], available: false }, {
        headers: { "Cache-Control": "private, max-age=60" },
      });
    }

    const { data: areas, error: areasError } = await supabase
      .from("pathao_area_catalog")
      .select("pathao_area_id, pathao_area_name, home_delivery_available")
      .eq("pathao_city_id", mapping.pathao_city_id)
      .eq("pathao_zone_id", mapping.pathao_zone_id)
      .eq("is_active", true)
      .eq("home_delivery_available", true)
      .order("pathao_area_name", { ascending: true })
      .limit(500);

    if (areasError) throw areasError;

    return NextResponse.json({
      success: true,
      available: Boolean(areas?.length),
      areas: areas ?? [],
    }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("Pathao checkout Area lookup failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not load Pathao delivery Areas right now." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
