export default function TrackOrderPage() {
  return (
    <main className="hero">
      <p className="eyebrow">TRACK ORDER</p>
      <h1>অর্ডার ট্র্যাক করুন</h1>
      <form action="#" className="track-form">
        <label htmlFor="order-number">অর্ডার নম্বর</label>
        <input
          id="order-number"
          name="orderNumber"
          placeholder="যেমন: NWX-10025"
          required
        />
        <button className="primary-button" type="submit">খুঁজুন ↗</button>
      </form>
      <p className="hero-copy">
        এই ফর্মের সঙ্গে অর্ডার যাচাই ব্যবস্থা এখনো সংযুক্ত নয়।
      </p>
    </main>
  );
}