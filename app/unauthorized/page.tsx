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
        <a className="primary-button" href="/auth/login">
          লগইন পেজে ফিরে যান
        </a>
      </p>

      <p className="hero-copy">
        <a href="/">হোম পেজে ফিরুন</a>
      </p>
    </main>
  );
}