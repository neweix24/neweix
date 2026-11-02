"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";

export default function AccountView() {
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const supabase = createBrowserSupabaseClient();

        // Middleware has already validated this protected request with getClaims().
        // Read the browser's established session without starting another /user
        // request that could race refresh-token rotation.
        const {
          data: { session },
          error: authError,
        } = await supabase.auth.getSession();
        const user = session?.user;

        if (authError || !user) {
          if (active) {
            setErrorMessage("Your session could not be read. Refresh the page or sign in again.");
          }
          return;
        }

        const { data: profile, error } = await supabase
          .from("customer_profiles")
          .select("full_name,date_of_birth,avatar_url,preferred_language")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          throw new Error(
            "Profile could not be loaded. Check database permissions."
          );
        }

        if (!active) return;

        const metadataName =
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : "";

        const rawMetadataAvatar =
          typeof user.user_metadata?.picture === "string"
            ? user.user_metadata.picture
            : typeof user.user_metadata?.avatar_url === "string"
              ? user.user_metadata.avatar_url
              : "";
        const metadataAvatar = rawMetadataAvatar.startsWith("https://") ? rawMetadataAvatar : "";
        const rawLocale = typeof user.user_metadata?.locale === "string" ? user.user_metadata.locale : "";
        const metadataLanguage = /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLocale) ? rawLocale : null;

        const { error: profileSyncError } = await supabase
          .from("customer_profiles")
          .upsert({
            user_id: user.id,
            email: user.email ?? null,
            full_name: profile?.full_name ?? (metadataName || null),
            avatar_url: profile?.avatar_url ?? (metadataAvatar || null),
            date_of_birth: profile?.date_of_birth ?? null,
            preferred_language: profile?.preferred_language ?? metadataLanguage,
          }, { onConflict: "user_id" });
        if (profileSyncError) {
          console.error("Customer account profile sync failed:", profileSyncError.message);
        }

        setEmail(user.email ?? "");
        const isOAuthUser = user.identities?.some((identity: { provider: string }) => identity.provider !== "email") ?? false;
        setEmailVerified(Boolean(isOAuthUser && user.email_confirmed_at));
        setName(profile?.full_name ?? metadataName);
        setDateOfBirth(profile?.date_of_birth ?? "");
        setAvatarUrl(profile?.avatar_url ?? metadataAvatar);

        const phoneResponse = await fetch("/api/account/phone/status", {
          cache: "no-store",
        });
        const phoneStatus = await phoneResponse.json().catch(() => null);
        if (phoneResponse.ok && phoneStatus?.success) {
          setPhoneVerified(Boolean(phoneStatus.verified));
          setVerifiedPhone(
            typeof phoneStatus.phone === "string" ? phoneStatus.phone : ""
          );
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not load the account."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAccount();

    return () => {
      active = false;
    };
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!phoneVerified) {
      setErrorMessage("Verify your phone number before saving your information.");
      return;
    }

    const cleanName = name.trim();
    const cleanDateOfBirth = dateOfBirth || null;
    const today = new Date().toISOString().slice(0, 10);

    if (cleanDateOfBirth && (cleanDateOfBirth < "1900-01-01" || cleanDateOfBirth > today)) {
      setErrorMessage("Enter a valid date of birth.");
      return;
    }

    if (cleanName.length < 2 || cleanName.length > 100) {
      setErrorMessage("Enter a name between 2 and 100 characters.");
      return;
    }


    setSaving(true);

    try {
      const supabase = createBrowserSupabaseClient();

      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (authError || !user) {
        setErrorMessage("Your session could not be read. Refresh the page or sign in again.");
        return;
      }

      const { error } = await supabase
        .from("customer_profiles")
        .upsert(
          {
            user_id: user.id,
            full_name: cleanName,
            date_of_birth: cleanDateOfBirth,
          },
          { onConflict: "user_id" }
        );

      if (error) {
        throw new Error(
          "Information was not saved. Check database permissions."
        );
      }

      setName(cleanName);
      setMessage("Your name has been saved successfully.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save your information."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSendOtp() {
    setPhoneMessage("");
    setPhoneError("");
    setChallengeId("");
    setOtp("");

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setPhoneError("Enter a mobile number to verify.");
      return;
    }

    setSendingOtp(true);
    try {
      const response = await fetch("/api/account/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not send the OTP.");

      if (result?.alreadyVerified) {
        setPhoneVerified(true);
        setVerifiedPhone(cleanPhone);
        setPhone("");
        setPhoneMessage("This number has already been verified.");
      } else if (typeof result?.challengeId === "string") {
        setChallengeId(result.challengeId);
        setPhoneMessage("OTP sent. Enter the code within 5 minutes.");
      } else {
        throw new Error("The OTP request returned an invalid result.");
      }
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : "Could not send the OTP.");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyOtp() {
    setPhoneMessage("");
    setPhoneError("");
    if (!challengeId || !/^\d{6}$/.test(otp)) {
      setPhoneError("Enter a valid 6-digit OTP.");
      return;
    }

    setVerifyingOtp(true);
    try {
      const response = await fetch("/api/account/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, otp }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not verify the OTP.");

      setPhoneVerified(true);
      setEditingPhone(false);
      setVerifiedPhone(typeof result?.phone === "string" ? result.phone : phone.trim());
      setPhone("");
      setOtp("");
      setChallengeId("");
      setPhoneMessage("Your phone number has been verified successfully.");
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : "Could not verify the OTP.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setErrorMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw new Error("Could not sign out. Please try again.");
      }

      window.location.replace("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not sign out."
      );
      setLoggingOut(false);
    }
  }

  return (
    <main className="account-page">
      <header className="account-header">
        <Link href="/" className="account-brand">
          NEWEIX
        </Link>
        <Link href="/" className="account-home">
          ← Continue shopping
        </Link>
      </header>

      <section className="account-content">
        <h1>My account</h1>
        <p className="account-description">
          View and update your personal information.
        </p>

        {loading ? (
          <p role="status">Loading account…</p>
        ) : (
          <>
            <div className="account-email">
              {avatarUrl && (
                <img src={avatarUrl} alt="Profile picture" width={64} height={64}
                  referrerPolicy="no-referrer"
                  style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
              )}
              <span>Sign-in email</span>
              <div className="account-email-value">
                <strong>{email || "No email provided"}</strong>
                {emailVerified && <span className="verified-badge" aria-label="Email verified"><Icon name="check" size={13} /> Verified</span>}
              </div>
            </div>

            <form className="account-form" onSubmit={handleSave}>
              {!phoneVerified && (
                <p className="phone-required" role="status">
                  Verify your Bangladesh mobile number by OTP to access additional account features.
                </p>
              )}

              {phoneVerified && (
                <>
                  <label htmlFor="customer-name">Your name</label>
                  <input
                    id="customer-name"
                    type="text"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />

                  <label htmlFor="customer-date-of-birth">Date of birth (optional)</label>
                  <input
                    id="customer-date-of-birth"
                    type="date"
                    autoComplete="bday"
                    min="1900-01-01"
                    max={new Date().toISOString().slice(0, 10)}
                    value={dateOfBirth}
                    onChange={(event) => setDateOfBirth(event.target.value)}
                  />
                </>
              )}

              <div className="phone-verification">
                <strong>Phone number</strong>
                {phoneVerified && !editingPhone ? (
                  <div className="verified-phone-row">
                    <span>{verifiedPhone}</span>
                    <button
                      className="phone-edit-button"
                      type="button"
                      aria-label="Change phone number"
                      title="Change phone number"
                      onClick={() => {
                        setEditingPhone(true);
                        setPhone("");
                        setPhoneMessage("");
                        setPhoneError("");
                      }}
                    >
                      <Icon name="edit" size={17} />
                    </button>
                    <span className="verified-badge" aria-label="Phone number verified"><Icon name="check" size={13} /> Verified</span>
                  </div>
                ) : (
                  <>
                    {phoneVerified && (
                      <button className="phone-cancel-button" type="button" onClick={() => {
                        setEditingPhone(false);
                        setPhone("");
                        setOtp("");
                        setChallengeId("");
                        setPhoneMessage("");
                        setPhoneError("");
                      }}>Cancel</button>
                    )}
                    <label htmlFor="customer-phone">Mobile number</label>
                    <input
                      id="customer-phone"
                      type="tel"
                      autoComplete="tel"
                      maxLength={20}
                      placeholder="Example: 01XXXXXXXXX"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      disabled={sendingOtp || verifyingOtp}
                    />
                    <button type="button" onClick={() => void handleSendOtp()}
                      disabled={sendingOtp || verifyingOtp || !phone.trim()}>
                      <><Icon name={sendingOtp ? "refresh" : "send"} size={16} /> {sendingOtp ? "Sending OTP…" : "Send OTP"}</>
                    </button>
                    {challengeId && (
                      <>
                        <label htmlFor="customer-phone-otp">6-digit OTP</label>
                        <input
                          id="customer-phone-otp"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={otp}
                          onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          disabled={verifyingOtp}
                        />
                        <button type="button" onClick={() => void handleVerifyOtp()}
                          disabled={verifyingOtp || otp.length !== 6}>
                          <><Icon name={verifyingOtp ? "refresh" : "shield"} size={16} /> {verifyingOtp ? "Verifying…" : "Verify OTP"}</>
                        </button>
                      </>
                    )}
                  </>
                )}
                {phoneMessage && <p className="success" role="status">{phoneMessage}</p>}
                {phoneError && <p className="error" role="alert">{phoneError}</p>}
              </div>

              {phoneVerified && message && (
                <p className="success" role="status">
                  {message}
                </p>
              )}

              {errorMessage && (
                <p className="error" role="alert">
                  {errorMessage}
                </p>
              )}

              {phoneVerified && (
                <button type="submit" disabled={saving}>
                  <><Icon name={saving ? "refresh" : "check"} size={16} /> {saving ? "Saving…" : "Save information"}</>
                </button>
              )}
            </form>

            {phoneVerified && (
              <nav className="account-links" aria-label="Account links">
                <Link href="/account/eixpay">EixPay Wallet · Eixon</Link>
                <Link href="/account/neweix-plus">Neweix+ Membership</Link>
                <Link href="/eixverse">EixVerse</Link>
                <Link href="/orders">My orders</Link>
                <Link href="/wishlist">Wishlist</Link>
                <Link href="/cart">Shopping cart</Link>
                <Link href="/account/theme">🎨 Customize your theme</Link>
                <Link href="/account/addresses">My addresses</Link>
                <Link href="/account/privacy">Privacy & preferences</Link>
                <Link href="/account/data-requests">My data and privacy</Link>
              </nav>
            )}

            <button
              className="logout"
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <><Icon name={loggingOut ? "refresh" : "logout"} size={16} /> {loggingOut ? "Signing out…" : "Sign out"}</>
            </button>
          </>
        )}
      </section>

      <style jsx>{`
        .account-page {
          min-height: 100vh;
          padding: 0 20px 72px;
          background: radial-gradient(ellipse at 85% 0%, rgba(182,255,74,.14), transparent 38%), linear-gradient(145deg, #fbfff7, #f3fff5 58%, #f5fbff);
          color: var(--ink);
          color: var(--ink);
        }

        .account-header {
          max-width: 1120px;
          min-height: 76px;
          margin: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid var(--border);
        }

        .account-brand {
          color: var(--primary);
          font-weight: 800;
          letter-spacing: 2px;
          text-decoration: none;
        }

        .account-home {
          color: var(--muted);
          text-decoration: none;
          font-size: 14px;
        }

        .account-content {
          box-sizing: border-box;
          max-width: 820px;
          margin: 42px auto 0;
          padding: clamp(22px, 4vw, 38px);
          border: 1px solid #e0eae0;
          border-radius: 26px;
          background: rgba(255,255,255,.96);
          box-shadow: 0 18px 48px rgba(45,110,65,.08);
        }

        .account-eyebrow {
          color: var(--primary);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        h1 {
          margin: 10px 0;
          font-size: clamp(30px, 5vw, 44px);
          font-weight: 900;
          letter-spacing: -1.2px;
          color: var(--ink);
        }

        .account-description {
          color: var(--muted);
          line-height: 1.7;
        }

        .account-email {
          display: grid;
          gap: 7px;
          margin: 22px 0;
          padding: 14px;
          border-radius: 9px;
          background: var(--bg);
          overflow-wrap: anywhere;
        }

        .account-email > span {
          color: var(--muted);
          font-size: 13px;
        }

        .account-email-value {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 9px;
        }

        .verified-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          width: fit-content;
          padding: 3px 8px;
          border: 1px solid #86c99b;
          border-radius: 999px;
          background: #eaf8ee;
          color: #176b35;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.4;
          white-space: nowrap;
        }

        .verified-phone {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 7px;
        }

        .account-form {
          display: grid;
          gap: 10px;
        }

        .account-form label {
          margin-top: 8px;
          font-size: 14px;
          font-weight: 600;
        }

        .account-form input {
          box-sizing: border-box;
          width: 100%;
          min-height: 48px;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--surface);
          color: var(--ink);
          font: inherit;
        }

        .account-form input:focus {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }

        .account-form button {
          min-height: 48px;
          margin-top: 14px;
          padding: 12px;
          border: 0;
          border-radius: 9px;
          background: var(--primary);
          color: #080b09;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .phone-required {
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 9px;
          background: var(--bg);
          color: var(--muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .phone-verification {
          display: grid;
          gap: 9px;
          margin: 18px 0;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface-raised);
        }

        .phone-verification button {
          min-height: 44px;
          margin-top: 2px;
          border: 0;
          border-radius: 9px;
          background: var(--primary-hover);
          color: #080b09;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }

        .verified-phone-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 9px;
          min-height: 38px;
        }

        .phone-edit-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          min-height: 34px;
          margin: 0;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
          color: var(--ink);
          cursor: pointer;
        }

        .phone-cancel-button {
          justify-self: start;
          min-height: 32px;
          margin: 0;
          padding: 4px 10px;
          border: 1px solid var(--border);
          border-radius: 7px;
          background: var(--surface);
          color: var(--ink);
          font: inherit;
          cursor: pointer;
        }

        .success {
          color: var(--success);
          font-size: 14px;
        }

        .error {
          color: var(--danger);
          font-size: 14px;
        }

        .account-links {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 10px;
          margin-top: 26px;
          padding-top: 22px;
          border-top: 1px solid var(--border);
        }

        .account-links a {
          display: flex;
          align-items: center;
          min-height: 48px;
          padding: 12px 14px;
          border: 1px solid #e5eee3;
          border-radius: 12px;
          background: #fbfef9;
          color: #285c3b;
          font-size: 13px;
          font-weight: 750;
          text-decoration: none;
          transition: border-color .18s ease, transform .18s ease, background .18s ease;
        }

        .account-links a:hover {
          border-color: #9acb91;
          background: #f2ffec;
          transform: translateY(-1px);
        }

        .account-home:hover { text-decoration: underline; }

        .logout {
          margin-top: 26px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--danger);
          font: inherit;
          cursor: pointer;
        }

        @media (max-width: 480px) {
          .account-content {
            margin-top: 26px;
            padding: 22px;
          }

          .account-header {
            min-height: 64px;
          }
        }
      `}</style>
    </main>
  );
}