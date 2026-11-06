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
        // Read the customer identity through the same server-side cookie
        // validation used by protected account APIs. Browser getSession() can
        // briefly return null after an OAuth redirect while SSR cookies have
        // already been accepted by middleware.
        const profileResponse = await fetch("/api/account/profile", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
        });
        const profileResult = await profileResponse.json().catch(() => null);
        if (
          !profileResponse.ok ||
          !profileResult?.success ||
          !profileResult.profile ||
          !profileResult.user
        ) {
          throw new Error(
            profileResult?.error ||
            (profileResponse.status === 401
              ? "Your sign-in session has expired. Please sign in again."
              : "Your profile could not be loaded. Please try again.")
          );
        }

        const user = profileResult.user;

        if (!active) return;

        const profile = profileResult.profile;
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

        setEmail(user.email ?? "");
        const isOAuthUser = user.identities?.some((identity: { provider: string }) => identity.provider !== "email") ?? false;
        setEmailVerified(Boolean(isOAuthUser && user.email_confirmed_at));
        setName(profile.full_name ?? metadataName);
        setDateOfBirth(profile.date_of_birth ?? "");
        setAvatarUrl(profile.avatar_url ?? metadataAvatar);

        const phoneResponse = await fetch("/api/account/phone/status", {
          cache: "no-store",
        });
        const phoneStatus = await phoneResponse.json().catch(() => null);
        if (!phoneResponse.ok || !phoneStatus?.success) {
          throw new Error(phoneStatus?.error || "Your phone verification status could not be loaded. Refresh the page and sign in again.");
        }
        setPhoneVerified(Boolean(phoneStatus.verified));
        setVerifiedPhone(
          typeof phoneStatus.phone === "string" ? phoneStatus.phone : ""
        );
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
      const response = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          full_name: cleanName,
          date_of_birth: cleanDateOfBirth,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Information was not saved. Please try again.");
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

        <nav className="account-shortcuts" aria-label="Account menu">
          <Link href="/orders" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="orders" size={21} /></span><strong>My orders</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/track-order" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="truck" size={21} /></span><strong>Track order</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/wishlist" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="heart" size={21} /></span><strong>Wishlist</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/compare" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="compare" size={21} /></span><strong>Compare products</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/cart" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="cart" size={21} /></span><strong>Shopping cart</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/account/addresses" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="map-pin" size={21} /></span><strong>Delivery addresses</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/account/eixpay" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="wallet" size={21} /></span><strong>Wallet · Eixon</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/account/neweix-plus" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="membership" size={21} /></span><strong>Neweix+ membership</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/eixverse" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="globe" size={21} /></span><strong>EixVerse</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/account/theme" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="settings" size={21} /></span><strong>Appearance</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/account/privacy" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="shield" size={21} /></span><strong>Privacy &amp; consent</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/account/data-requests" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="user" size={21} /></span><strong>Personal data</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/account/returns" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="refresh" size={21} /></span><strong>Returns &amp; refunds</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/faq" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="help" size={21} /></span><strong>Help &amp; FAQ</strong><Icon name="chevron-right" size={18} /></Link>
          <Link href="/contact" className="account-shortcut"><span className="account-shortcut-icon"><Icon name="mail" size={21} /></span><strong>Contact support</strong><Icon name="chevron-right" size={18} /></Link>
        </nav>

        {loading ? (
          <p role="status">Loading account…</p>
        ) : (
          <>
            <section className="account-main-panel" id="account-overview" aria-label="Account overview">
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

            </section>

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
          background: radial-gradient(ellipse at 88% 0%, rgba(197,165,106,.13), transparent 34rem), radial-gradient(ellipse at 5% 90%, rgba(8,127,99,.07), transparent 30rem), var(--porcelain);
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
          max-width: 1180px;
          margin: 42px auto 0;
        }

        .account-shortcuts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
          gap: 14px;
          margin: 26px 0 22px;
        }

        .account-shortcut {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          padding: 17px;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--surface-raised);
          box-shadow: 0 10px 28px rgba(20,43,59,.045);
          color: var(--ink);
          text-decoration: none;
          transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }

        .account-shortcut:hover,
        .account-shortcut:focus-visible {
          transform: translateY(-2px);
          border-color: rgba(8,127,99,.42);
          box-shadow: 0 14px 32px rgba(20,43,59,.09);
          outline: none;
        }

        .account-shortcut-icon {
          display: grid;
          flex: 0 0 42px;
          width: 42px;
          height: 42px;
          place-items: center;
          border-radius: 12px;
          background: color-mix(in srgb, var(--emerald) 10%, var(--surface));
          color: var(--emerald);
        }

        .account-shortcut strong { flex: 1; min-width: 0; font-size: 14px; font-weight: 800; }
        .account-shortcut > svg { flex: 0 0 auto; margin-left: auto; color: var(--emerald); }

        .account-main-panel {
          min-width: 0;
          padding: clamp(18px, 2.6vw, 28px);
          border: 1px solid var(--border);
          border-radius: 22px;
          background: var(--surface-raised);
          box-shadow: 0 14px 38px rgba(20,43,59,.06);
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
          border: 1px solid rgba(8,127,99,.28);
          border-radius: 999px;
          background: color-mix(in srgb, var(--emerald) 9%, var(--surface));
          color: var(--emerald);
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
          color: #ffffff;
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
          color: #ffffff;
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

        @media (max-width: 760px) {
          .account-shortcuts { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .account-shortcut { padding: 13px 11px; gap: 9px; }
          .account-shortcut-icon { flex-basis: 36px; width: 36px; height: 36px; }
          .account-shortcut strong { font-size: 12px; }
        }
        @media (max-width: 360px) {
          .account-shortcuts { grid-template-columns: 1fr; }
        }

        @media (max-width: 480px) {
          .account-content {
            margin-top: 26px;
          }

          .account-main-panel {
            padding: 18px;
            border-radius: 18px;
          }

          .account-header {
            min-height: 64px;
          }
        }
      `}</style>
    </main>
  );
}