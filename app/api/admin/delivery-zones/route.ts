import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";
import { BANGLADESH_ADMIN_AREAS } from "@/lib/bangladesh-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Staff = { userId: string } | { error: string; status: number };

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function authorize(): Promise<Staff> {
  const session = await createServerSupabaseClient();
  const { data, error } = await session.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return { error: "Authentication required.", status: 401 };

  const { data: profile, error: profileError } = await session
    .from("staff_profiles").select("role, is_active").eq("user_id", userId).maybeSingle();
  if (profileError || !profile || profile.is_active !== true || !["supreme", "admin"].includes(profile.role)) {
    return { error: "Only active Admin or Supreme accounts can manage delivery zones.", status: 403 };
  }
  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance?.currentLevel !== "aal2") return { error: "Complete MFA verification for the Supreme account.", status: 403 };
  }
  return { userId };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16 * 1024) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

const ZONE_COLUMNS = "id, zone_code, division_code, division_name, district_code, district_name, upazila_code, upazila_name, upazila_name_bn, delivery_fee, is_active, updated_at";

export async function GET() {
  try {
    const staff = await authorize();
    if ("error" in staff) return responseError(staff.error, staff.status);
    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin.from("neweix_delivery_zones")
      .select(ZONE_COLUMNS).order("district_name", { ascending: true }).order("upazila_name", { ascending: true });
    if (error) {
      console.error("NEWEIX delivery-zone list failed:", error.message);
      return responseError("Could not load NEWEIX delivery zones. Apply the own-delivery database migration first.", 503);
    }
    return NextResponse.json({ success: true, zones: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("NEWEIX delivery-zone GET failed:", error);
    return responseError("A server error occurred.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const staff = await authorize();
    if ("error" in staff) return responseError(staff.error, staff.status);
    const body = await readBody(request);
    if (!body) return responseError("Provide valid JSON (maximum 16 KB).", 400);

    const divisionCode = typeof body.division_code === "string" ? body.division_code : "";
    const districtCode = typeof body.district_code === "string" ? body.district_code : "";
    const upazilaCode = typeof body.upazila_code === "string" ? body.upazila_code : "";
    const division = BANGLADESH_ADMIN_AREAS.find((item) => item.code === divisionCode);
    const district = division?.districts.find((item) => item.code === districtCode);
    const upazila = district?.upazilas.find((item) => item.code === upazilaCode);
    if (!division || !district || !upazila) return responseError("Select a valid division, district and upazila.", 400);
    if (division.code !== "BD-D08" || district.code !== "BD-D08-Z62") {
      return responseError("NEWEIX own delivery is currently limited to Mymensingh district.", 409);
    }

    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin.from("neweix_delivery_zones").upsert({
      zone_code: upazila.code,
      division_code: division.code,
      division_name: division.name,
      district_code: district.code,
      district_name: district.name,
      upazila_code: upazila.code,
      upazila_name: upazila.name,
      upazila_name_bn: upazila.bn_name,
      delivery_fee: null,
      is_active: false,
    }, { onConflict: "upazila_code", ignoreDuplicates: true }).select(ZONE_COLUMNS).maybeSingle();

    if (error) {
      console.error("NEWEIX delivery-zone create failed:", error.message);
      return responseError("Could not add this delivery zone.", error.code === "23505" ? 409 : 503);
    }
    let zone = data;
    if (!zone) {
      const existing = await admin.from("neweix_delivery_zones").select(ZONE_COLUMNS)
        .eq("upazila_code", upazila.code).maybeSingle();
      if (existing.error || !existing.data) return responseError("The delivery zone could not be confirmed.", 503);
      zone = existing.data;
    }
    if (data) {
      const { error: auditError } = await admin.from("audit_logs").insert({
        actor_id: staff.userId, action: "delivery.zone_added", target_type: "neweix_delivery_zone",
        target_id: zone.id, details: { division_code: division.code, district_code: district.code, upazila_code: upazila.code },
      });
      if (auditError) console.error("Delivery-zone create audit log failed:", auditError.message);
    }
    return NextResponse.json({ success: true, zone }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("NEWEIX delivery-zone POST failed:", error);
    return responseError("A server error occurred.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const staff = await authorize();
    if ("error" in staff) return responseError(staff.error, staff.status);
    const body = await readBody(request);
    if (!body) return responseError("Provide valid JSON (maximum 16 KB).", 400);
    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return responseError("A valid delivery-zone ID is required.", 400);
    }
    if (!("delivery_fee" in body) || !("is_active" in body)) return responseError("Provide both a delivery fee and active status.", 400);
    const fee = body.delivery_fee === null || body.delivery_fee === "" ? null : Number(body.delivery_fee);
    const isActive = body.is_active;
    if (fee !== null && (!Number.isSafeInteger(fee) || fee < 0 || fee > 100000)) {
      return responseError("Delivery fee must be a whole BDT amount between 0 and 100,000.", 400);
    }
    if (typeof isActive !== "boolean") return responseError("Active status must be true or false.", 400);
    if (isActive && fee === null) return responseError("Set the real delivery fee before activating this zone.", 409);

    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin.from("neweix_delivery_zones")
      .update({ delivery_fee: fee, is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id).select(ZONE_COLUMNS).maybeSingle();
    if (error || !data) {
      console.error("NEWEIX delivery-zone update failed:", error?.message);
      return responseError("Could not update this delivery zone.", error?.code === "23514" ? 409 : 503);
    }
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: staff.userId, action: "delivery.zone_updated", target_type: "neweix_delivery_zone",
      target_id: id, details: { delivery_fee: fee, is_active: isActive },
    });
    if (auditError) console.error("Delivery-zone update audit log failed:", auditError.message);
    return NextResponse.json({ success: true, zone: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("NEWEIX delivery-zone PATCH failed:", error);
    return responseError("A server error occurred.", 500);
  }
}
