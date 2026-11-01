import { getWorkforceContext, getActorDepartmentIds, isExecutive, jsonError, readJson } from "@/lib/workforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    if (!isExecutive(actor.role) && actor.role !== "manager") return jsonError("Not authorized.", 403);

    let query = db.from("department_memberships")
      .select("id, department_id, user_id, assigned_by, assigned_at, staff_profiles!inner(display_name, role, is_active)")
      .order("assigned_at", { ascending: false }).limit(500);

    if (actor.role === "manager") {
      const ids = await getActorDepartmentIds(db, actor);
      query = query.in("department_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }

    const { data, error } = await query;
    if (error) return jsonError("Could not load department members.", 500);
    return Response.json({ members: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    if (!isExecutive(actor.role)) return jsonError("Only Admin or Supreme can assign employees to departments.", 403);

    const body = await readJson(request, 4096);
    if (!body) return jsonError("Invalid or oversized request.", 400);
    const departmentId = typeof body.departmentId === "string" ? body.departmentId : "";
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!UUID.test(departmentId) || !UUID.test(userId)) return jsonError("Select a valid department and Employee.", 400);

    const { data: department, error: departmentError } = await db.from("departments")
      .select("id, manager_user_id, is_active").eq("id", departmentId).maybeSingle();
    if (departmentError || !department || department.is_active !== true) return jsonError("Department not found or inactive.", 404);
    if (actor.role === "manager" && department.manager_user_id !== actor.userId) return jsonError("You can manage members only in your department.", 403);

    const { data: employee, error: employeeError } = await db.from("staff_profiles")
      .select("role, is_active").eq("user_id", userId).maybeSingle();
    if (employeeError || !employee || employee.role !== "employee" || employee.is_active !== true) {
      return jsonError("Only active Employee accounts can be assigned.", 400);
    }

    const { data, error } = await db.from("department_memberships").insert({
      department_id: departmentId, user_id: userId, assigned_by: actor.userId,
    }).select("id, department_id, user_id, assigned_by, assigned_at").single();

    if (error?.code === "23505") return jsonError("Employee is already assigned to a department. Remove the existing assignment first.", 409);
    if (error || !data) return jsonError("Could not assign Employee.", 500);
    await db.from("audit_logs").insert({
      actor_id: actor.userId, action: "workforce.employee.assigned",
      target_type: "department_membership", target_id: data.id,
      details: { department_id: departmentId, employee_user_id: userId },
    });
    return Response.json({ success: true, membership: data }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    if (!isExecutive(actor.role) && actor.role !== "manager") return jsonError("Only Admin, Manager or Supreme can remove employee assignments.", 403);

    const body = await readJson(request, 4096);
    if (!body) return jsonError("Invalid request.", 400);
    const membershipId = typeof body.membershipId === "string" ? body.membershipId : "";
    if (!UUID.test(membershipId)) return jsonError("Invalid membership ID.", 400);

    const { data: membership, error: findError } = await db.from("department_memberships")
      .select("id, department_id, user_id").eq("id", membershipId).maybeSingle();
    if (findError || !membership) return jsonError("Assignment not found.", 404);
    if (actor.role === "manager") {
      const ids = await getActorDepartmentIds(db, actor);
      if (!ids.includes(membership.department_id)) return jsonError("This assignment is outside your department.", 403);
    }

    const { error } = await db.from("department_memberships").delete().eq("id", membershipId);
    if (error) return jsonError("Could not remove assignment.", 500);
    await db.from("audit_logs").insert({
      actor_id: actor.userId, action: "workforce.employee.unassigned",
      target_type: "department_membership", target_id: membershipId,
      details: { department_id: membership.department_id, employee_user_id: membership.user_id },
    });
    return Response.json({ success: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}
