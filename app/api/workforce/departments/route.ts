import { getWorkforceContext, getActorDepartmentIds, isExecutive, jsonError, readJson } from "@/lib/workforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;

    let query = db.from("departments")
      .select("id, name, code, description, manager_user_id, is_active, created_at")
      .eq("is_active", true).order("name");
    if (actor.role === "manager") query = query.eq("manager_user_id", actor.userId);
    else if (actor.role === "employee" || actor.role === "staff") {
      const ids = await getActorDepartmentIds(db, actor);
      query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }
    const { data, error } = await query;
    if (error) return jsonError("Could not load departments.", 500);
    return Response.json({ departments: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    if (!isExecutive(actor.role)) return jsonError("Only Admin or Supreme can create departments.", 403);

    const body = await readJson(request, 4096);
    if (!body) return jsonError("Invalid or oversized request.", 400);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const managerUserId = typeof body.managerUserId === "string" ? body.managerUserId : null;

    if (name.length < 2 || name.length > 100) return jsonError("Department name must be 2–100 characters.", 400);
    if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code)) return jsonError("Department code must be 2–20 uppercase letters, numbers, _ or -.", 400);
    if (description.length > 1000) return jsonError("Description is too long.", 400);

    if (managerUserId) {
      const { data: manager, error } = await db.from("staff_profiles")
        .select("role, is_active").eq("user_id", managerUserId).maybeSingle();
      if (error || !manager || manager.role !== "manager" || manager.is_active !== true) {
        return jsonError("Selected account is not an active Manager.", 400);
      }
    }

    const { data, error } = await db.from("departments").insert({
      name, code, description, manager_user_id: managerUserId, created_by: actor.userId,
    }).select("id, name, code, description, manager_user_id, is_active, created_at").single();

    if (error?.code === "23505") return jsonError("Department code or Manager assignment already exists.", 409);
    if (error || !data) return jsonError("Could not create department.", 500);

    await db.from("audit_logs").insert({
      actor_id: actor.userId,
      action: "workforce.department.created",
      target_type: "department",
      target_id: data.id,
      details: { code, manager_user_id: managerUserId },
    });

    return Response.json({ success: true, department: data }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}
