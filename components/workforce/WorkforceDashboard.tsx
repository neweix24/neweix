"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Role = "manager" | "employee";
type Department = { id: string; name: string; code: string };
type Member = { user_id: string; display_name: string | null; role: string };
type Task = { id: string; department_id: string; assigned_to: string; title: string; description: string; priority: string; status: string; due_at: string | null; created_at: string };
type Attendance = { id: string; attendance_date: string; check_in_at: string | null; check_out_at: string | null; status: string; employee_note: string | null; manager_note: string | null; user_id: string };
type Api<T> = T & { error?: string; success?: boolean };

function localDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}
function time(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("en-BD", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function WorkforceDashboard({ role }: { role: Role }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueAt, setDueAt] = useState("");

  const todayAttendance = useMemo(() => attendance.find((row) => row.attendance_date === localDate()), [attendance]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const urls = role === "manager"
        ? ["/api/workforce/departments", "/api/workforce/members", "/api/workforce/tasks", "/api/workforce/attendance"]
        : ["/api/workforce/tasks", "/api/workforce/attendance"];
      const responses = await Promise.all(urls.map((url) => fetch(url, { cache: "no-store" })));
      const payloads = await Promise.all(responses.map((response) => response.json()));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed >= 0) throw new Error(payloads[failed]?.error || "Could not load workforce data.");
      if (role === "manager") {
        setDepartments(payloads[0].departments ?? []);
        setMembers((payloads[1].members ?? []).map((row: { user_id: string; staff_profiles?: { display_name?: string | null } }) => ({
          user_id: row.user_id, display_name: row.staff_profiles?.display_name ?? null, role: "employee",
        })));
        setTasks(payloads[2].tasks ?? []);
        setAttendance(payloads[3].attendance ?? []);
        if (!departmentId && payloads[0].departments?.[0]) setDepartmentId(payloads[0].departments[0].id);
      } else {
        setTasks(payloads[0].tasks ?? []);
        setAttendance(payloads[1].attendance ?? []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [role, departmentId]);

  useEffect(() => { void load(); }, [load]);

  async function updateTask(id: string, status: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/workforce/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }),
      });
      const result = (await response.json()) as Api<{ task?: Task }>;
      if (!response.ok) throw new Error(result.error || "Could not update task.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update task.");
    } finally { setBusy(false); }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/workforce/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, assignedTo, title, description, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : null }),
      });
      const result = (await response.json()) as Api<{ task?: Task }>;
      if (!response.ok) throw new Error(result.error || "Could not assign task.");
      setTitle(""); setDescription(""); setAssignedTo(""); setDueAt("");
      setMessage("Task assigned.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not assign task.");
    } finally { setBusy(false); }
  }

  async function attendanceAction(action: "check_in" | "check_out") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/workforce/attendance", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as Api<{ attendance?: Attendance }>;
      if (!response.ok) throw new Error(result.error || "Could not record attendance.");
      setMessage(action === "check_in" ? "Check-in recorded." : "Check-out recorded.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record attendance.");
    } finally { setBusy(false); }
  }

  if (loading) return <p className="rounded-xl border p-5">Loading your workspace…</p>;

  return (
    <div className="space-y-7">
      {message && <p role="status" aria-live="polite" className="rounded-xl border p-3">{message}</p>}
      <section className="rounded-2xl border p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Daily attendance</h2><p className="text-sm opacity-70">Bangladesh time · {localDate()}</p></div>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg border px-4 py-2" disabled={busy || !!todayAttendance?.check_in_at} onClick={() => void attendanceAction("check_in")}>Check in</button>
            <button type="button" className="rounded-lg border px-4 py-2" disabled={busy || !todayAttendance?.check_in_at || !!todayAttendance?.check_out_at} onClick={() => void attendanceAction("check_out")}>Check out</button>
          </div>
        </div>
        <p className="text-sm">Check-in: {time(todayAttendance?.check_in_at ?? null)} · Check-out: {time(todayAttendance?.check_out_at ?? null)}</p>
      </section>

      {role === "manager" && (
        <section className="rounded-2xl border p-5 space-y-4">
          <h2 className="text-xl font-semibold">Assign a department task</h2>
          {departments.length === 0 ? <p>No department has been assigned to your Manager account yet.</p> : members.length === 0 ? <p>No Employees are assigned to your department yet. Ask Admin to assign Employees first.</p> : (
            <form onSubmit={createTask} className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Department
                <select className="rounded-lg border p-3" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} required>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Assign to Employee
                <select className="rounded-lg border p-3" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} required>
                  <option value="">Select Employee</option>
                  {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.user_id}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">Task title
                <input className="rounded-lg border p-3" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={160} required />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">Description
                <textarea className="rounded-lg border p-3" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} />
              </label>
              <label className="grid gap-1 text-sm">Priority
                <select className="rounded-lg border p-3" value={priority} onChange={(event) => setPriority(event.target.value)}>
                  <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">Due date
                <input className="rounded-lg border p-3" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </label>
              <button className="rounded-lg border px-4 py-3 font-semibold sm:col-span-2" type="submit" disabled={busy || !assignedTo}>Assign task</button>
            </form>
          )}
        </section>
      )}

      <section className="rounded-2xl border p-5 space-y-4">
        <h2 className="text-xl font-semibold">{role === "manager" ? "Department tasks" : "My tasks"}</h2>
        {tasks.length === 0 ? <p>No tasks assigned yet.</p> : tasks.map((task) => (
          <article key={task.id} className="rounded-xl border p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{task.title}</h3><span className="rounded-full border px-3 py-1 text-xs">{task.status.replace("_", " ")}</span></div>
            {task.description && <p className="text-sm opacity-80">{task.description}</p>}
            <p className="text-xs opacity-70">Priority: {task.priority} · Due: {task.due_at ? new Date(task.due_at).toLocaleString() : "Not set"}</p>
            {task.status !== "completed" && task.status !== "cancelled" && (
              <div className="flex flex-wrap gap-2">
                {(["in_progress", "blocked", "completed"] as const).map((status) => (
                  <button key={status} type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={busy || task.status === status} onClick={() => void updateTask(task.id, status)}>{status.replace("_", " ")}</button>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>

      {role === "manager" && (
        <section className="rounded-2xl border p-5 space-y-3">
          <h2 className="text-xl font-semibold">Department attendance</h2>
          {attendance.length === 0 ? <p>No attendance records yet.</p> : attendance.map((record) => (
            <article key={record.id} className="flex flex-wrap justify-between gap-2 border-b py-3 text-sm">
              <div><p className="font-medium">{record.user_id}</p><p>{record.attendance_date} · In {time(record.check_in_at)} · Out {time(record.check_out_at)}</p></div>
              <span>{record.status}</span>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
