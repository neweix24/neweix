"use client";

import { useEffect, useState, type FormEvent } from "react";

type CartItem = {
  product_id: string;
  quantity: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [orderNumber, setOrderNumber] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const saved = localStorage.getItem("neweix_cart");
        const parsed: unknown = saved ? JSON.parse(saved) : [];

        if (!Array.isArray(parsed) || parsed.length === 0) {
          setCart([]);
          return;
        }

        const valid = parsed.filter(
          (item): item is CartItem =>
            item !== null &&
            typeof item === "object" &&
            typeof item.product_id === "string" &&
            Number.isSafeInteger(item.quantity) &&
            item.quantity > 0 &&
            item.quantity <= 100
        );

        setCart(valid);

        const response = await fetch("/api/products");
        const result = await response.json();

        if (!response.ok) throw new Error();
        setProducts(result.data ?? []);
      } catch {
        setError("কার্ট বা পণ্যের তথ্য লোড হয়নি। আবার চেষ্টা করুন।");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const total = cart.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.product_id);
    return sum + (product ? Number(product.price) * item.quantity : 0);
  }, 0);

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (cart.length === 0) {
      setError("আপনার কার্ট খালি। আগে পণ্য যোগ করুন।");
      return;
    }

    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: String(form.get("customer_name") ?? "").trim(),
          customer_phone: String(form.get("customer_phone") ?? "").trim(),
          customer_email: String(form.get("customer_email") ?? "").trim(),
          shipping_address: String(form.get("shipping_address") ?? "").trim(),
          shipping_city: String(form.get("shipping_city") ?? "").trim(),
          payment_method: "cod",
          items: cart,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "অর্ডার তৈরি করা যায়নি।");
      }

      localStorage.removeItem("neweix_cart");
      setCart([]);
      setOrderNumber(result.order?.order_number || "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="hero"><p>লোড হচ্ছে...</p></main>;
  }

  if (orderNumber) {
    return (
      <main className="hero">
        <p className="eyebrow">ORDER RECEIVED</p>
        <h1>অর্ডার গ্রহণ করা হয়েছে!</h1>
        <p>আপনার অর্ডার নম্বর:</p>
        <h2>{orderNumber}</h2>
        <p>অর্ডারের নম্বরটি সংরক্ষণ করুন।</p>
        <a className="primary-button" href="/">হোমপেজে ফিরুন</a>
      </main>
    );
  }

  if (cart.length === 0) {
    return (
      <main className="hero">
        <h1>আপনার কার্ট খালি</h1>
        <a className="primary-button" href="/">পণ্য দেখুন</a>
      </main>
    );
  }

  return (
    <main className="hero">
      <p className="eyebrow">CHECKOUT · CASH ON DELIVERY</p>
      <h1>অর্ডার সম্পন্ন করুন</h1>
      <p>পণ্যের আনুমানিক মোট: {formatPrice(total)}</p>
      <p>ডেলিভারি চার্জ পরে নিশ্চিত করা হবে।</p>

      <form
        onSubmit={submitOrder}
        style={{ maxWidth: 520, margin: "24px auto", textAlign: "left" }}
      >
        <label htmlFor="customer_name">আপনার নাম *</label>
        <input
          id="customer_name"
          name="customer_name"
          required
          maxLength={120}
          autoComplete="name"
          style={{ display: "block", width: "100%", margin: "8px 0 16px", padding: 12 }}
        />

        <label htmlFor="customer_phone">মোবাইল নম্বর *</label>
        <input
          id="customer_phone"
          name="customer_phone"
          required
          type="tel"
          maxLength={30}
          autoComplete="tel"
          style={{ display: "block", width: "100%", margin: "8px 0 16px", padding: 12 }}
        />

        <label htmlFor="customer_email">ইমেইল (ঐচ্ছিক)</label>
        <input
          id="customer_email"
          name="customer_email"
          type="email"
          maxLength={254}
          autoComplete="email"
          style={{ display: "block", width: "100%", margin: "8px 0 16px", padding: 12 }}
        />

        <label htmlFor="shipping_address">সম্পূর্ণ ডেলিভারি ঠিকানা *</label>
        <textarea
          id="shipping_address"
          name="shipping_address"
          required
          maxLength={1000}
          autoComplete="street-address"
          rows={3}
          style={{ display: "block", width: "100%", margin: "8px 0 16px", padding: 12 }}
        />

        <label htmlFor="shipping_city">শহর / জেলা</label>
        <input
          id="shipping_city"
          name="shipping_city"
          maxLength={120}
          autoComplete="address-level2"
          style={{ display: "block", width: "100%", margin: "8px 0 16px", padding: 12 }}
        />

        <p><strong>পেমেন্ট:</strong> ক্যাশ অন ডেলিভারি (COD)</p>

        {error && (
          <p role="alert" style={{ color: "crimson" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || cart.length === 0}
        >
          {submitting ? "অর্ডার জমা হচ্ছে..." : "অর্ডার নিশ্চিত করুন"}
        </button>
      </form>

      <p><a href="/cart">← কার্টে ফিরে যান</a></p>
    </main>
  );
}