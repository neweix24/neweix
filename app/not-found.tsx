import Link from "next/link";

export default function NotFound() {
  return (
    <main className="hero">
      <p className="eyebrow">404</p>
      <h1>পেজটি পাওয়া যায়নি।</h1>
      <p className="hero-copy">ঠিকানা পরীক্ষা করে আবার চেষ্টা করুন।</p>
      <Link className="primary-button" href="/">হোম পেজে ফিরুন ↗</Link>
    </main>
  );
}