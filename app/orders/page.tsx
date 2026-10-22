export default function OrdersPage() {
  return (
    <main className="hero">
      <p className="eyebrow">MY ORDERS</p>
      <h1>আমার অর্ডার</h1>
      <p className="hero-copy">অর্ডার দেখতে লগইন ও ডাটাবেস সংযোগ প্রয়োজন।</p>
      <a className="primary-button" href="/auth/login">লগইন করুন ↗</a>
    </main>
  );
}