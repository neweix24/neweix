"use client";

import { useState, type FormEvent } from "react";
import Icon from "@/components/ui/icon";

type CreateResult = {
  message?: string;
  error?: string;
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
};

export default function StaffCreateForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "employee">("employee");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setIsError(false);

    if (password.length < 12 || password.length > 128) {
      setIsError(true);
      setMessage("Password must be between 12 and 128 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/supreme/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          role,
        }),
      });

      const result = (await response.json()) as CreateResult;

      if (!response.ok) {
        throw new Error(
          result.error || "Could not create the account."
        );
      }

      setMessage(
        result.message ||
          `Request completed. Email: ${result.user?.email || email.trim()}`
      );

      setEmail("");
      setPassword("");
      setRole("employee");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="staff-email">Email Address</label>
        <input
          id="staff-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={254}
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="staff-password">Temporary Password</label>
        <input
          id="staff-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={12}
          maxLength={128}
          disabled={loading}
        />
        <p>Use at least 12 characters.</p>
      </div>

      <div>
        <label htmlFor="staff-role">Account Role</label>
        <select
          id="staff-role"
          value={role}
          onChange={(event) =>
            setRole(event.target.value as "admin" | "manager" | "employee")
          }
          disabled={loading}
        >
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <button type="submit" disabled={loading}>
        <><Icon name={loading ? "refresh" : "user"} size={16} /> {loading ? "Creating..." : "Create Account"}</>
      </button>

      {message && (
        <p role="status" aria-live="polite">
          {isError ? "Error: " : ""}
          {message}
        </p>
      )}
    </form>
  );
}