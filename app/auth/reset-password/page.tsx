"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    if (password.length < 8) {
      setMessage("The password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const supabase = createBrowserSupabaseClient();

      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session) {
        setMessage(
          "This reset link has expired or is invalid. Request a new reset link."
        );
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        console.error("Password update failed:", error.message);
        setMessage("Password was not changed: " + error.message);
        return;
      }

      setSuccess(true);
      setMessage("Your password has been changed successfully. You can now sign in.");
    } catch {
      setMessage("Something went wrong. Request a new reset link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hero auth-page">
      <p className="eyebrow">NEWEIX · ACCOUNT RECOVERY</p>
      <h1>Set a new password</h1>
      <p className="hero-copy">
        নতুন The password must be at least 8 characters long.
      </p>

      <form className="track-form" onSubmit={handleSubmit}>
        <label htmlFor="password">New password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {message && (
          <p role={success ? "status" : "alert"}>{message}</p>
        )}

        {success ? (
          <Link className="primary-button" href="/auth/login">
            Go to sign-in
          </Link>
        ) : (
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Updating..." : "Change password"}
          </button>
        )}
      </form>

      <p className="hero-copy">
        <Link href="/auth/login">Return to sign-in</Link>
      </p>
    </main>
  );
}