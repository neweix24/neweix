"use client";

import { useState, type FormEvent } from "react";
import Icon from "@/components/ui/icon";

type ApiResult = {
  success?: boolean;
  message?: string;
  error?: string;
  nomination?: { id: string; candidate_name: string; candidate_email: string; status: string };
  user?: { email?: string; role?: string };
};

export default function AdminStaffManager() {
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeePassword, setEmployeePassword] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"employee" | "nomination" | null>(null);
  const [notice, setNotice] = useState("");

  async function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (employeePassword.length < 12 || employeePassword.length > 128) {
      setNotice("Employee password must be 12–128 characters.");
      return;
    }
    setBusy("employee");
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: employeeEmail.trim(), password: employeePassword, role: "employee" }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error || "Could not create Employee account.");
      setNotice(result.message || `Employee account created: ${result.user?.email ?? employeeEmail}`);
      setEmployeeEmail("");
      setEmployeePassword("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setBusy(null);
    }
  }

  async function submitNomination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setBusy("nomination");
    try {
      const response = await fetch("/api/admin/manager-nominations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateName, candidateEmail: candidateEmail.trim(), reason }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error || "Could not submit nomination.");
      setNotice("Manager nomination submitted to Supreme for review.");
      setCandidateName("");
      setCandidateEmail("");
      setReason("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2>Create Employee Account</h2>
        <p>Admin can directly create Employee accounts. Admin cannot create another Admin or Manager.</p>
        <form className="track-form" onSubmit={submitEmployee}>
          <label htmlFor="employee-email">Employee email</label>
          <input id="employee-email" type="email" autoComplete="email" required maxLength={254} value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} disabled={busy !== null} />
          <label htmlFor="employee-password">Temporary password</label>
          <input id="employee-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={employeePassword} onChange={(event) => setEmployeePassword(event.target.value)} disabled={busy !== null} />
          <button className="primary-button" type="submit" disabled={busy !== null}>
            <Icon name={busy === "employee" ? "refresh" : "user"} size={16} /> {busy === "employee" ? "Creating…" : "Create Employee"}
          </button>
        </form>
      </section>

      <section>
        <h2>Propose a Manager</h2>
        <p>Supreme must approve the nomination before a Manager account is provisioned.</p>
        <form className="track-form" onSubmit={submitNomination}>
          <label htmlFor="manager-candidate-name">Candidate name</label>
          <input id="manager-candidate-name" required minLength={2} maxLength={120} value={candidateName} onChange={(event) => setCandidateName(event.target.value)} disabled={busy !== null} />
          <label htmlFor="manager-candidate-email">Candidate email</label>
          <input id="manager-candidate-email" type="email" required maxLength={254} value={candidateEmail} onChange={(event) => setCandidateEmail(event.target.value)} disabled={busy !== null} />
          <label htmlFor="manager-reason">Reason for nomination</label>
          <textarea id="manager-reason" required minLength={10} maxLength={2000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy !== null} />
          <button className="primary-button" type="submit" disabled={busy !== null}>
            <Icon name={busy === "nomination" ? "refresh" : "user"} size={16} /> {busy === "nomination" ? "Submitting…" : "Submit to Supreme"}
          </button>
        </form>
      </section>
      {notice && <p role="status" aria-live="polite">{notice}</p>}
    </div>
  );
}
