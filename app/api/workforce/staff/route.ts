import { getWorkforceContext, getActorDepartmentIds, isExecutive, jsonError } from "@/lib/workforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    if (!isExecutive(actor.role) && actor.role !== "manager") return jsonError("Not authorized.", 403);

    let allowedIds: string[] | null = null;
    if (actor.role === "manager") {
      const departments = await getActorDepartmentIds(db, actor);
      if (!departments.length) return Response.json({ staff: [] }, { headers: { "cache-control": "no-store" } });
      const { data: memberships, error: membershipError } = await db.from("department_memberships")
        .select("user_id").in("department_id", departments);
      if (membershipError) return jsonError("Could not load department staff.", 500);
      allowedIds = (memberships ?? []).map((row) => row.user_id as string);
    }

    let query = db.from("staff_profiles")
      .select("user_id, display_name, role, is_active, created_at")
      .in("role", ["manager", "employee"]).eq("is_active", true)
      .order("display_name").limit(500);
    if (allowedIds) query = query.in("user_id", allowedIds.length ? allowedIds : ["00000000-0000-0000-0000-000000000000"]);

    const { data, error } = await query;
    if (error) return jsonError("Could not load staff list.", 500);
    return Response.json({ staff: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}
