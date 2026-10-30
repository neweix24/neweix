"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AccountView() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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
          .select("full_name, phone")
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

        setEmail(user.email ?? "");
        setName(profile?.full_name ?? metadataName);
        setPhone(profile?.phone ?? "");
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
    const cleanPhone = phone.trim();

    if (cleanName.length < 2 || cleanName.length > 100) {
      setErrorMessage("নাম ২ থেকে ১০০ অক্ষরের মধ্যে লিখুন।");
      return;
    }

    if (cleanPhone.length > 30) {
      setErrorMessage("ফোন নম্বর সর্বোচ্চ ৩০ অক্ষরের হতে পারবে।");
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
            phone: cleanPhone || null,
          },
          { onConflict: "user_id" }
        );

      if (error) {
        throw new Error(
          "তথ্য সংরক্ষণ হয়নি। ডাটাবেসের অনুমতি যাচাই করতে হবে।"
        );
      }

      setName(cleanName);
      setPhone(cleanPhone);
      setMessage("আপনার তথ্য সফলভাবে সংরক্ষণ হয়েছে।");
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

              <label htmlFor="customer-phone">ফোন নম্বর</label>
              <input
                id="customer-phone"
                type="tel"
                autoComplete="tel"
                maxLength={30}
                placeholder="যেমন: 01XXXXXXXXX"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />

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
                {saving ? "সংরক্ষণ হচ্ছে…" : "তথ্য সংরক্ষণ করুন"}
              </button>
            </form>

            <nav className="account-links" aria-label="অ্যাকাউন্টের লিংক">
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
              {loggingOut ? "লগআউট হচ্ছে…" : "লগআউট"}
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
          color: var(--ink);
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
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
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
          background: var(--ink);
          color: var(--surface);
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: wait;
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
          color: var(--ink);
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