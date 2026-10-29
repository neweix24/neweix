import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · ACCESS CONTROL</p>

      <h1>প্রবেশের অনুমতি নেই</h1>

      <p className="hero-copy">
        আপনার অ্যাকাউন্টের এই পেজে প্রবেশের অনুমতি নেই।
        সক্রিয় ও অনুমোদিত স্টাফ অ্যাকাউন্ট দিয়ে লগইন করুন।
      </p>

      <p>
        <Link className="primary-button" href="/auth/login">
          লগইন পেজে ফিরে যান
        </Link>
      </p>

      <p className="hero-copy">
        <Link href="/">হোম পেজে ফিরুন</Link>
      </p>
    </main>
  );
}
