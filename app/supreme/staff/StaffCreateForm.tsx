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
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setIsError(false);

    if (password.length < 12 || password.length > 128) {
      setIsError(true);
      setMessage("পাসওয়ার্ড ১২ থেকে ১২৮ অক্ষরের হতে হবে।");
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
          result.error || "অ্যাকাউন্ট তৈরি করা যায়নি।"
        );
      }

      setMessage(
        result.message ||
          `অনুরোধ সফল হয়েছে। ইমেইল: ${result.user?.email || email.trim()}`
      );

      setEmail("");
      setPassword("");
      setRole("staff");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "একটি অপ্রত্যাশিত সমস্যা হয়েছে।"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="staff-email">ইমেইল ঠিকানা</label>
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
        <label htmlFor="staff-password">অস্থায়ী পাসওয়ার্ড</label>
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
        <p>কমপক্ষে ১২ অক্ষর ব্যবহার করুন।</p>
      </div>

      <div>
        <label htmlFor="staff-role">অ্যাকাউন্টের ধরন</label>
        <select
          id="staff-role"
          value={role}
          onChange={(event) =>
            setRole(event.target.value as "admin" | "staff")
          }
          disabled={loading}
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <button type="submit" disabled={loading}>
        <><Icon name={loading ? "refresh" : "user"} size={16} /> {loading ? "তৈরি হচ্ছে..." : "অ্যাকাউন্ট তৈরি করুন"}</>
      </button>

      {message && (
        <p role="status" aria-live="polite">
          {isError ? "সমস্যা: " : ""}
          {message}
        </p>
      )}
    </form>
  );
}