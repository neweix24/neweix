"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/icon";

export default function AccountView() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
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

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace("/auth/customer-login?next=/account");
          return;
        }

        const { data: profile, error } = await supabase
          .from("customer_profiles")
          .select("full_name,date_of_birth,avatar_url,preferred_language")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          throw new Error(
            "প্রোফাইল লোড হয়নি। ডাটাবেসের অনুমতি যাচাই করতে হবে।"
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
              : "অ্যাকাউন্ট লোড করা যায়নি।"
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
  }, [router]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    const cleanName = name.trim();
    const cleanDateOfBirth = dateOfBirth || null;
    const today = new Date().toISOString().slice(0, 10);

    if (cleanDateOfBirth && (cleanDateOfBirth < "1900-01-01" || cleanDateOfBirth > today)) {
      setErrorMessage("জন্মতারিখ সঠিকভাবে দিন।");
      return;
    }

    if (cleanName.length < 2 || cleanName.length > 100) {
      setErrorMessage("নাম ২ থেকে ১০০ অক্ষরের মধ্যে লিখুন।");
      return;
    }


    setSaving(true);

    try {
      const supabase = createBrowserSupabaseClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/auth/customer-login?next=/account");
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
          "তথ্য সংরক্ষণ হয়নি। ডাটাবেসের অনুমতি যাচাই করতে হবে।"
        );
      }

      setName(cleanName);
      setMessage("আপনার নাম সফলভাবে সংরক্ষণ হয়েছে।");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "তথ্য সংরক্ষণ করা যায়নি।"
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
      setPhoneError("যাচাই করার জন্য মোবাইল নম্বর লিখুন।");
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
      if (!response.ok) throw new Error(result?.error || "OTP পাঠানো যায়নি।");

      if (result?.alreadyVerified) {
        setPhoneVerified(true);
        setVerifiedPhone(cleanPhone);
        setPhone("");
        setPhoneMessage("এই নম্বরটি ইতিমধ্যে যাচাই করা আছে।");
      } else if (typeof result?.challengeId === "string") {
        setChallengeId(result.challengeId);
        setPhoneMessage("OTP পাঠানো হয়েছে। ৫ মিনিটের মধ্যে কোডটি লিখুন।");
      } else {
        throw new Error("OTP অনুরোধের ফলাফল সঠিক নয়।");
      }
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : "OTP পাঠানো যায়নি।");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyOtp() {
    setPhoneMessage("");
    setPhoneError("");
    if (!challengeId || !/^\d{6}$/.test(otp)) {
      setPhoneError("৬ সংখ্যার সঠিক OTP লিখুন।");
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
      if (!response.ok) throw new Error(result?.error || "OTP যাচাই করা যায়নি।");

      setPhoneVerified(true);
      setVerifiedPhone(typeof result?.phone === "string" ? result.phone : phone.trim());
      setPhone("");
      setOtp("");
      setChallengeId("");
      setPhoneMessage("আপনার ফোন নম্বর সফলভাবে যাচাই হয়েছে।");
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : "OTP যাচাই করা যায়নি।");
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
        throw new Error("লগআউট করা যায়নি। আবার চেষ্টা করুন।");
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "লগআউট করা যায়নি।"
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
          ← শপিং চালিয়ে যান
        </Link>
      </header>

      <section className="account-content">
        <p className="account-eyebrow">CUSTOMER ACCOUNT</p>
        <h1>আমার অ্যাকাউন্ট</h1>
        <p className="account-description">
          আপনার ব্যক্তিগত তথ্য দেখুন ও আপডেট করুন।
        </p>

        {loading ? (
          <p role="status">অ্যাকাউন্ট লোড হচ্ছে…</p>
        ) : (
          <>
            <div className="account-email">
              {avatarUrl && (
                <img src={avatarUrl} alt="প্রোফাইল ছবি" width={64} height={64}
                  referrerPolicy="no-referrer"
                  style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
              )}
              <span>লগইন ইমেইল</span>
              <strong>{email || "ইমেইল দেওয়া নেই"}</strong>
            </div>

            <form className="account-form" onSubmit={handleSave}>
              <label htmlFor="customer-name">আপনার নাম</label>
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

              <label htmlFor="customer-date-of-birth">জন্মতারিখ (ঐচ্ছিক)</label>
              <input
                id="customer-date-of-birth"
                type="date"
                autoComplete="bday"
                min="1900-01-01"
                max={new Date().toISOString().slice(0, 10)}
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
              />

              <div className="phone-verification">
                <strong>ফোন নম্বর যাচাই</strong>
                <p>অ্যাকাউন্টের অতিরিক্ত সুবিধা এবং অর্ডার অ্যাকাউন্টে সংরক্ষণের জন্য ফোন নম্বর OTP দিয়ে যাচাই করুন। OTP-এর মেয়াদ ৫ মিনিট।</p>
                {phoneVerified ? (
                  <p className="success" role="status">যাচাইকৃত নম্বর: {verifiedPhone}</p>
                ) : (
                  <p className="error">ফোন যাচাই না করলে অতিথি হিসেবে অর্ডার করতে পারবেন; অর্ডার অ্যাকাউন্টে সংরক্ষিত হবে না।</p>
                )}
                <label htmlFor="customer-phone">
                  {phoneVerified ? "নতুন নম্বর দিয়ে পরিবর্তন করুন" : "মোবাইল নম্বর"}
                </label>
                <input
                  id="customer-phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={20}
                  placeholder="যেমন: 01XXXXXXXXX"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={sendingOtp || verifyingOtp}
                />
                <button type="button" onClick={() => void handleSendOtp()}
                  disabled={sendingOtp || verifyingOtp || !phone.trim()}>
                  <><Icon name={sendingOtp ? "refresh" : "send"} size={16} /> {sendingOtp ? "OTP পাঠানো হচ্ছে…" : "OTP পাঠান"}</>
                </button>
                {challengeId && (
                  <>
                    <label htmlFor="customer-phone-otp">৬ সংখ্যার OTP</label>
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
                      <><Icon name={verifyingOtp ? "refresh" : "shield"} size={16} /> {verifyingOtp ? "যাচাই হচ্ছে…" : "OTP যাচাই করুন"}</>
                    </button>
                  </>
                )}
                {phoneMessage && <p className="success" role="status">{phoneMessage}</p>}
                {phoneError && <p className="error" role="alert">{phoneError}</p>}
              </div>

              {message && (
                <p className="success" role="status">
                  {message}
                </p>
              )}

              {errorMessage && (
                <p className="error" role="alert">
                  {errorMessage}
                </p>
              )}

              <button type="submit" disabled={saving}>
                <><Icon name={saving ? "refresh" : "check"} size={16} /> {saving ? "সংরক্ষণ হচ্ছে…" : "তথ্য সংরক্ষণ করুন"}</>
              </button>
            </form>

            <nav className="account-links" aria-label="অ্যাকাউন্টের লিংক">
              <Link href="/account/eixpay">EixPay Wallet · Eixon</Link>
              <Link href="/account/neweix-plus">Neweix+ Membership</Link>
              <Link href="/eixverse">EixVerse</Link>
              <Link href="/orders">আমার অর্ডার</Link>
              <Link href="/wishlist">পছন্দের তালিকা</Link>
              <Link href="/cart">শপিং কার্ট</Link>
              <Link href="/account/theme">🎨 নিজের থিম সাজাও</Link>
              <Link href="/account/addresses">আমার ঠিকানা</Link>
              <Link href="/account/privacy">গোপনীয়তা ও পছন্দ</Link>
              <Link href="/account/data-requests">আমার তথ্য ও গোপনীয়তা</Link>
            </nav>

            <button
              className="logout"
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <><Icon name={loggingOut ? "refresh" : "logout"} size={16} /> {loggingOut ? "লগআউট হচ্ছে…" : "লগআউট"}</>
            </button>
          </>
        )}
      </section>

      <style jsx>{`
        .account-page {
          min-height: 100vh;
          padding: 0 20px 60px;
          background: var(--bg);
          color: var(--ink);
        }

        .account-header {
          max-width: 1000px;
          min-height: 72px;
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
          max-width: 520px;
          margin: 44px auto 0;
          padding: 30px;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--surface);
          box-shadow: 0 12px 35px rgba(182,255,74,.08);
        }

        .account-eyebrow {
          color: var(--primary);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        h1 {
          margin: 10px 0;
          font-size: 32px;
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

        .account-email span {
          color: var(--muted);
          font-size: 13px;
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

        .phone-verification p {
          margin: 2px 0;
          line-height: 1.6;
          overflow-wrap: anywhere;
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
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          margin-top: 26px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }

        .account-links a {
          color: var(--primary);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }

        .account-links a:hover,
        .account-home:hover {
          text-decoration: underline;
        }

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