import { getWorkforceContext, getActorDepartmentIds, isExecutive, jsonError, readJson } from "@/lib/workforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dhakaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    const url = new URL(request.url);
    const requestedDate = url.searchParams.get("date");
    const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : null;

    let query = db.from("workforce_attendance")
      .select("id, user_id, department_id, attendance_date, check_in_at, check_out_at, status, employee_note, manager_note, reviewed_by, reviewed_at")
      .order("attendance_date", { ascending: false }).limit(200);
    if (date) query = query.eq("attendance_date", date);

    if (actor.role === "employee" || actor.role === "staff") {
      query = query.eq("user_id", actor.userId);
    } else if (actor.role === "manager") {
      const ids = await getActorDepartmentIds(db, actor);
      query = query.in("department_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    } else if (!isExecutive(actor.role)) {
      return jsonError("Not authorized.", 403);
    }

    const { data, error } = await query;
    if (error) return jsonError("Could not load attendance records.", 500);
    return Response.json({ attendance: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    if (!["manager", "employee", "staff"].includes(actor.role)) {
      return jsonError("Only assigned Managers and Employees can submit personal attendance.", 403);
    }

    const body = await readJson(request, 4096);
    if (!body) return jsonError("Invalid or oversized request.", 400);
    const action = body.action;
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > 1000) return jsonError("Attendance note is too long.", 400);
    if (action !== "check_in" && action !== "check_out") return jsonError("Action must be check_in or check_out.", 400);

    const departmentIds = await getActorDepartmentIds(db, actor);
    if (departmentIds.length !== 1) return jsonError("Your account must be assigned to exactly one active department before attendance can be recorded.", 409);
    const departmentId = departmentIds[0];
    const today = dhakaDate();

    if (action === "check_in") {
      const { data, error } = await db.from("workforce_attendance").insert({
        user_id: actor.userId,
        department_id: departmentId,
        attendance_date: today,
        check_in_at: new Date().toISOString(),
        employee_note: note || null,
      }).select("id, attendance_date, check_in_at, check_out_at, status").single();
      if (error?.code === "23505") return jsonError("You have already checked in today.", 409);
      if (error || !data) return jsonError("Could not record check-in.", 500);
      await db.from("audit_logs").insert({
        actor_id: actor.userId, action: "workforce.attendance.checked_in",
        target_type: "workforce_attendance", target_id: data.id, details: { department_id: departmentId, attendance_date: today },
      });
      return Response.json({ success: true, attendance: data }, { status: 201, headers: { "cache-control": "no-store" } });
    }

    const { data: existing, error: findError } = await db.from("workforce_attendance")
      .select("id, check_in_at, check_out_at").eq("user_id", actor.userId).eq("attendance_date", today).maybeSingle();
    if (findError || !existing || !existing.check_in_at) return jsonError("Check in before checking out.", 409);
    if (existing.check_out_at) return jsonError("You have already checked out today.", 409);

    const { data, error } = await db.from("workforce_attendance").update({
      check_out_at: new Date().toISOString(),
      employee_note: note || undefined,
    }).eq("id", existing.id).is("check_out_at", null)
      .select("id, attendance_date, check_in_at, check_out_at, status").maybeSingle();
    if (error || !data) return jsonError("Could not record check-out. Refresh and try again.", 409);
    await db.from("audit_logs").insert({
      actor_id: actor.userId, action: "workforce.attendance.checked_out",
      target_type: "workforce_attendance", target_id: data.id, details: { department_id: departmentId, attendance_date: today },
    });
    return Response.json({ success: true, attendance: data }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getWorkforceContext();
    if (!context) return jsonError("Sign-in or Supreme MFA verification required.", 401);
    const { actor, db } = context;
    if (!isExecutive(actor.role) && actor.role !== "manager") return jsonError("Only Admin, Manager or Supreme can review attendance.", 403);

    const body = await readJson(request, 4096);
    if (!body) return jsonError("Invalid or oversized request.", 400);
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status;
    const managerNote = typeof body.managerNote === "string" ? body.managerNote.trim() : null;
    if (!UUID.test(id)) return jsonError("Invalid attendance record ID.", 400);
    if (!["present", "late", "half_day", "leave", "absent"].includes(String(status))) return jsonError("Invalid attendance status.", 400);
    if (managerNote !== null && managerNote.length > 1000) return jsonError("Review note is too long.", 400);

    const { data: existing, error: findError } = await db.from("workforce_attendance")
      .select("id, department_id").eq("id", id).maybeSingle();
    if (findError || !existing) return jsonError("Attendance record not found.", 404);
    if (actor.role === "manager") {
      const ids = await getActorDepartmentIds(db, actor);
      if (!ids.includes(existing.department_id)) return jsonError("This attendance record is outside your department.", 403);
    }

    const { data, error } = await db.from("workforce_attendance").update({
      status,
      manager_note: managerNote,
      reviewed_by: actor.userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id).select("id, status, manager_note, reviewed_by, reviewed_at").single();
    if (error || !data) return jsonError("Could not review attendance.", 500);
    await db.from("audit_logs").insert({
      actor_id: actor.userId, action: "workforce.attendance.reviewed",
      target_type: "workforce_attendance", target_id: id, details: { status },
    });
    return Response.json({ success: true, attendance: data }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Workforce service unavailable.", 500);
  }
}
