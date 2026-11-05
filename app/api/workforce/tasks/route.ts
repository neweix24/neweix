import { getWorkforceContext, getActorDepartmentIds, isExecutive, jsonError, readJson } from "@/lib/workforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;

    let query = db.from("workforce_tasks")
      .select("id, department_id, assigned_to, assigned_by, title, description, priority, status, due_at, completed_at, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(200);

    if (actor.role === "employee" || actor.role === "staff") {
      query = query.eq("assigned_to", actor.userId);
    } else if (actor.role === "manager") {
      const ids = await getActorDepartmentIds(db, actor);
      query = query.in("department_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    } else if (!isExecutive(actor.role)) {
      return jsonError("Not authorized.", 403);
    }

    const { data, error } = await query;
    if (error) return jsonError("Could not load tasks.", 500);
    return Response.json({ tasks: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    if (!isExecutive(actor.role) && actor.role !== "manager") return jsonError("Only Admin, Manager or Supreme can assign tasks.", 403);

    const body = await readJson(request, 8192);
    if (!body) return jsonError("Invalid or oversized request.", 400);
    const departmentId = typeof body.departmentId === "string" ? body.departmentId : "";
    const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const priority = body.priority;
    const dueAt = typeof body.dueAt === "string" && body.dueAt ? body.dueAt : null;

    if (!UUID.test(departmentId) || !UUID.test(assignedTo)) return jsonError("Select a valid department and employee.", 400);
    if (title.length < 3 || title.length > 160) return jsonError("Task title must be 3–160 characters.", 400);
    if (description.length > 5000) return jsonError("Task description is too long.", 400);
    if (!["low", "normal", "high", "urgent"].includes(String(priority ?? "normal"))) return jsonError("Invalid task priority.", 400);
    if (dueAt && (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) < Date.now() - 86400000)) return jsonError("Invalid task due date.", 400);

    const { data: department, error: departmentError } = await db.from("departments")
      .select("id, manager_user_id, is_active").eq("id", departmentId).maybeSingle();
    if (departmentError || !department || department.is_active !== true) return jsonError("Department not found or inactive.", 404);
    if (actor.role === "manager" && department.manager_user_id !== actor.userId) return jsonError("You can assign tasks only within your department.", 403);

    const { data: employee, error: employeeError } = await db.from("staff_profiles")
      .select("role, is_active").eq("user_id", assignedTo).maybeSingle();
    if (employeeError || !employee || employee.role !== "employee" || employee.is_active !== true) {
      return jsonError("Tasks can only be assigned to active Employee accounts.", 400);
    }
    const { data: membership, error: membershipError } = await db.from("department_memberships")
      .select("id").eq("department_id", departmentId).eq("user_id", assignedTo).maybeSingle();
    if (membershipError || !membership) return jsonError("Employee is not assigned to this department.", 400);

    const { data, error } = await db.from("workforce_tasks").insert({
      department_id: departmentId,
      assigned_to: assignedTo,
      assigned_by: actor.userId,
      title,
      description,
      priority: priority ?? "normal",
      due_at: dueAt,
    }).select("id, department_id, assigned_to, assigned_by, title, description, priority, status, due_at, created_at").single();

    if (error || !data) return jsonError("Could not create task.", 500);
    await db.from("audit_logs").insert({
      actor_id: actor.userId,
      action: "workforce.task.created",
      target_type: "workforce_task",
      target_id: data.id,
      details: { department_id: departmentId, assigned_to: assignedTo },
    });
    return Response.json({ success: true, task: data }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    const body = await readJson(request, 4096);
    if (!body) return jsonError("Invalid or oversized request.", 400);
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status;
    if (!UUID.test(id)) return jsonError("Invalid task ID.", 400);
    if (!["todo", "in_progress", "blocked", "completed", "cancelled"].includes(String(status))) return jsonError("Invalid task status.", 400);

    const { data: task, error: taskError } = await db.from("workforce_tasks")
      .select("id, department_id, assigned_to").eq("id", id).maybeSingle();
    if (taskError || !task) return jsonError("Task not found.", 404);

    const executive = isExecutive(actor.role);
    const manager = actor.role === "manager";
    const employee = actor.role === "employee" || actor.role === "staff";
    if (manager) {
      const ids = await getActorDepartmentIds(db, actor);
      if (!ids.includes(task.department_id)) return jsonError("Task is outside your department.", 403);
    } else if (employee && task.assigned_to !== actor.userId) {
      return jsonError("You can update only your own assigned tasks.", 403);
    } else if (!executive && !employee && !manager) {
      return jsonError("Not authorized.", 403);
    }
    if (employee && !["in_progress", "blocked", "completed"].includes(String(status))) {
      return jsonError("Employees may set tasks to in progress, blocked or completed.", 403);
    }

    const { data, error } = await db.from("workforce_tasks").update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    }).eq("id", id).select("id, status, completed_at, updated_at").single();
    if (error || !data) return jsonError("Could not update task.", 500);
    await db.from("audit_logs").insert({
      actor_id: actor.userId,
      action: "workforce.task.status_updated",
      target_type: "workforce_task",
      target_id: id,
      details: { status },
    });
    return Response.json({ success: true, task: data }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}
