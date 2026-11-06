import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = ["present", "late", "half_day", "absent", "leave"] as const;
type AttendanceStatus = typeof STATUSES[number];

function validDate(value: string | null): value is string {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function authorize() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { ok: false as const, error: "Authentication required.", status: 401 as const };
  const { data: profile, error: profileError } = await session.from("staff_profiles")
    .select("role,is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || profile?.role !== "supreme" || profile.is_active !== true) {
    return { ok: false as const, error: "Only an active Supreme account can manage rider attendance.", status: 403 as const };
  }
  const { data: assurance, error: mfaError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { ok: false as const, error: "Complete MFA verification.", status: 403 as const };
  }
  return { ok: true as const, userId: user.id };
}

async function serviceClient() {
  const { env } = await getCloudflareContext();
  const runtimeEnv = env as Record<string, unknown>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== "string" || !url || typeof key !== "string" || !key) {
    throw new Error("Supabase server configuration is missing.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

export async function GET(request: Request) {
  try {
    const actor = await authorize();
    if (!actor.ok) return fail(actor.error, actor.status);
    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
      return fail("Select a valid attendance date range.", 400);
    }
    const todayParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const start = from ?? todayParts;
    const end = to ?? start;
    const supabase = await serviceClient();
    const [ridersResult, attendanceResult] = await Promise.all([
      supabase.from("neweix_delivery_riders")
        .select("id,rider_code,full_name,phone,is_active")
        .order("full_name", { ascending: true }),
      supabase.from("neweix_delivery_rider_attendance")
        .select("id,rider_id,work_date,attendance_status,check_in_at,check_out_at,notes,updated_at")
        .gte("work_date", start).lte("work_date", end)
        .order("work_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (ridersResult.error || attendanceResult.error) {
      console.error("Rider attendance query failed:", ridersResult.error?.message, attendanceResult.error?.message);
      return fail("Could not load rider attendance.", 503);
    }
    const riders = ridersResult.data ?? [];
    const riderMap = new Map(riders.map((rider) => [rider.id, rider]));
    const records = (attendanceResult.data ?? []).map((row) => ({
      ...row,
      rider: riderMap.get(row.rider_id) ?? null,
    }));
    const counts = {
      present: records.filter((row) => row.attendance_status === "present").length,
      late: records.filter((row) => row.attendance_status === "late").length,
      half_day: records.filter((row) => row.attendance_status === "half_day").length,
      absent: records.filter((row) => row.attendance_status === "absent").length,
      leave: records.filter((row) => row.attendance_status === "leave").length,
    };
    return NextResponse.json({
      success: true, range: { from: start, to: end }, riders, records, counts,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Rider attendance GET failed:", error);
    return fail("A server error occurred.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorize();
    if (!actor.ok) return fail(actor.error, actor.status);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return fail("Request too large.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return fail("Invalid JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid attendance request.", 400);
    const input = body as Record<string, unknown>;
    if (input.action !== "record_attendance") return fail("Unknown attendance action.", 400);
    if (typeof input.rider_id !== "string" || !UUID.test(input.rider_id)) return fail("Select a valid rider.", 400);
    if (typeof input.work_date !== "string" || !validDate(input.work_date)) return fail("Select a valid work date.", 400);
    if (typeof input.attendance_status !== "string" || !STATUSES.includes(input.attendance_status as AttendanceStatus)) {
      return fail("Select a valid attendance status.", 400);
    }
    if (input.check_in_at != null && !validTimestamp(input.check_in_at)) return fail("Enter a valid check-in time.", 400);
    if (input.check_out_at != null && !validTimestamp(input.check_out_at)) return fail("Enter a valid check-out time.", 400);
    if (input.notes != null && (typeof input.notes !== "string" || input.notes.length > 500)) return fail("Attendance note is too long.", 400);
    const supabase = await serviceClient();
    const { data, error } = await supabase.rpc("supreme_record_delivery_rider_attendance", {
      p_actor_id: actor.userId,
      p_rider_id: input.rider_id,
      p_work_date: input.work_date,
      p_attendance_status: input.attendance_status,
      p_check_in_at: input.check_in_at ?? null,
      p_check_out_at: input.check_out_at ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) {
      console.error("Rider attendance write failed:", error.message);
      if (error.message.includes("SUPREME_ACTOR_NOT_AUTHORIZED")) return fail("Supreme authorization required.", 403);
      if (error.message.includes("DELIVERY_RIDER_NOT_FOUND")) return fail("Rider not found.", 404);
      if (error.message.includes("INVALID_RIDER_ATTENDANCE_INPUT")) return fail("Attendance times and status do not match. Check the work date and time fields.", 400);
      return fail("Could not save rider attendance.", 400);
    }
    return NextResponse.json({ success: true, data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Rider attendance POST failed:", error);
    return fail("A server error occurred.", 500);
  }
}
