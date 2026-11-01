"use client";

import { useCallback, useEffect, useState } from "react";

type Department = { id: string; name: string; code: string; manager_user_id: string | null };
type Staff = { user_id: string; display_name: string | null; role: "manager" | "employee" };
type Membership = { id: string; department_id: string; user_id: string; staff_profiles?: { display_name?: string | null } };
type Payload = { error?: string; departments?: Department[]; staff?: Staff[]; members?: Membership[]; success?: boolean };

export default function AdminWorkforceManager() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employeeUserId, setEmployeeUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const responses = await Promise.all([
        fetch("/api/workforce/departments", { cache: "no-store" }),
        fetch("/api/workforce/staff", { cache: "no-store" }),
        fetch("/api/workforce/members", { cache: "no-store" }),
      ]);
      const data = await Promise.all(responses.map((response) => response.json() as Promise<Payload>));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed >= 0) throw new Error(data[failed].error || "Could not load workforce data.");
      setDepartments(data[0].departments ?? []);
      setStaff(data[1].staff ?? []);
      setMembers(data[2].members ?? []);
      if (!departmentId && data[0].departments?.[0]) setDepartmentId(data[0].departments[0].id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load workforce data.");
    }
  }, [departmentId]);

  useEffect(() => { void load(); }, [load]);

  async function createDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/workforce/departments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, description, managerUserId: managerUserId || null }),
      });
      const result = (await response.json()) as Payload;
      if (!response.ok) throw new Error(result.error || "Could not create department.");
      setName(""); setCode(""); setDescription(""); setManagerUserId("");
      setMessage("Department created.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create department.");
    } finally { setBusy(false); }
  }

  async function assignEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/workforce/members", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, userId: employeeUserId }),
      });
      const result = (await response.json()) as Payload;
      if (!response.ok) throw new Error(result.error || "Could not assign Employee.");
      setEmployeeUserId("");
      setMessage("Employee assigned to department.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not assign Employee.");
    } finally { setBusy(false); }
  }

  const employees = staff.filter((person) => person.role === "employee");
  const managers = staff.filter((person) => person.role === "manager");

  return (
    <div className="space-y-7">
      {message && <p role="status" aria-live="polite" className="rounded-xl border p-3">{message}</p>}
      <section className="rounded-2xl border p-5 space-y-4">
        <h2 className="text-xl font-semibold">Create department</h2>
        <form onSubmit={createDepartment} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Department name
            <input className="rounded-lg border p-3" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required />
          </label>
          <label className="grid gap-1 text-sm">Department code
            <input className="rounded-lg border p-3 uppercase" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} pattern="[A-Z0-9][A-Z0-9_-]{1,19}" maxLength={20} placeholder="SALES" required />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">Description
            <textarea className="rounded-lg border p-3" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">Department Manager (optional)
            <select className="rounded-lg border p-3" value={managerUserId} onChange={(event) => setManagerUserId(event.target.value)}>
              <option value="">Assign later</option>
              {managers.map((manager) => <option key={manager.user_id} value={manager.user_id}>{manager.display_name || manager.user_id}</option>)}
            </select>
          </label>
          <button className="rounded-lg border p-3 font-semibold sm:col-span-2" disabled={busy} type="submit">Create department</button>
        </form>
      </section>

      <section className="rounded-2xl border p-5 space-y-4">
        <h2 className="text-xl font-semibold">Assign Employee to department</h2>
        {departments.length === 0 ? <p>Create a department first.</p> : employees.length === 0 ? <p>No active Employee accounts found. Create an Employee account first.</p> : (
          <form onSubmit={assignEmployee} className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Department
              <select className="rounded-lg border p-3" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} required>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Employee
              <select className="rounded-lg border p-3" value={employeeUserId} onChange={(event) => setEmployeeUserId(event.target.value)} required>
                <option value="">Select Employee</option>
                {employees.filter((employee) => !members.some((member) => member.user_id === employee.user_id)).map((employee) => <option key={employee.user_id} value={employee.user_id}>{employee.display_name || employee.user_id}</option>)}
              </select>
            </label>
            <button className="rounded-lg border p-3 font-semibold sm:col-span-2" disabled={busy || !employeeUserId} type="submit">Assign Employee</button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-xl font-semibold">Departments and team members</h2>
        {departments.length === 0 ? <p>No departments yet.</p> : departments.map((department) => (
          <article key={department.id} className="rounded-xl border p-4">
            <h3 className="font-semibold">{department.name} <span className="text-xs opacity-60">({department.code})</span></h3>
            <p className="text-sm opacity-70">Manager: {staff.find((person) => person.user_id === department.manager_user_id)?.display_name || (department.manager_user_id ? "Assigned" : "Not assigned")}</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {members.filter((member) => member.department_id === department.id).map((member) => <li key={member.id}>{member.staff_profiles?.display_name || member.user_id}</li>)}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
