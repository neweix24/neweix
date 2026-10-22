type Props = { params: Promise<{ slug: string }> };

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  return (
    <main className="hero">
      <p className="eyebrow">PRODUCT DETAILS</p>
      <h1>পণ্যের বিবরণ</h1>
      <p className="hero-copy">পণ্যের ঠিকানা: {slug}</p>
      <p className="hero-copy">
        Supabase থেকে আসল পণ্যের তথ্য সংযুক্ত হলে এখানে দেখানো হবে।
      </p>
      <a className="primary-button" href="/cart">কার্টে যান ↗</a>
    </main>
  );
}