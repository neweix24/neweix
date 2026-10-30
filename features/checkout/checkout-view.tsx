
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
  stock?: number;
};

type PaymentMethod = "cod" | "bkash" | "nagad" | "rocket";

type PaymentConfig = {
  success: boolean;
  paymentMethods?: {
    bkash: { label: string; number: string; enabled: boolean };
    nagad: { label: string; number: string; enabled: boolean };
    rocket: { label: string; number: string; enabled: boolean };
  };
};

function formatPrice(price: number): string {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

function isValidCartItem(item: unknown): item is CartItem {
  if (!item || typeof item !== "object") return false;

  const value = item as Record<string, unknown>;

  return (
    typeof value.product_id === "string" &&
    value.product_id.length > 0 &&
    Number.isSafeInteger(value.quantity) &&
    Number(value.quantity) > 0 &&
    Number(value.quantity) <= 100
  );
}

export default function CheckoutView() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [paymentConfigError, setPaymentConfigError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [submittedPaymentMethod, setSubmittedPaymentMethod] =
    useState<PaymentMethod>("cod");

  useEffect(() => {
    let cancelled = false;

    async function loadCheckout() {
      try {
        const saved = localStorage.getItem("neweix_cart");
        const parsed: unknown = saved ? JSON.parse(saved) : [];

        if (!Array.isArray(parsed)) {
          throw new Error("কার্টের তথ্য সঠিক নয়।");
        }

        const merged = new Map<string, number>();

        for (const item of parsed.filter(isValidCartItem)) {
          const quantity = (merged.get(item.product_id) ?? 0) + item.quantity;

          if (quantity > 100) {
            throw new Error("একটি পণ্যের সর্বোচ্চ পরিমাণ ১০০টি।");
          }

          merged.set(item.product_id, quantity);
        }

        const normalizedCart = Array.from(
          merged,
          ([product_id, quantity]) => ({ product_id, quantity })
        );

        if (!cancelled) setCart(normalizedCart);

        const configPromise = fetch("/api/payment-config", {
          cache: "no-store",
        })
          .then(async (response) => {
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.success) {
              throw new Error("পেমেন্ট নম্বর লোড করা যায়নি।");
            }
            return data as PaymentConfig;
          })
          .catch((err) => {
            if (!cancelled) {
              setPaymentConfigError(
                err instanceof Error
                  ? err.message
                  : "পেমেন্ট নম্বর লোড করা যায়নি।"
              );
            }
            return null;
          });

        const productsPromise =
          normalizedCart.length === 0
            ? Promise.resolve(null)
            : fetch("/api/products", { cache: "no-store" }).then(
                async (response) => {
                  const data = await response.json().catch(() => null);
                  if (!response.ok || !Array.isArray(data?.data)) {
                    throw new Error("পণ্যের তথ্য লোড করা যায়নি।");
                  }
                  return data.data as Product[];
                }
              );

        const [config, loadedProducts] = await Promise.all([
          configPromise,
          productsPromise,
        ]);

        if (!cancelled) {
          if (config) setPaymentConfig(config);
          if (loadedProducts) setProducts(loadedProducts);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "চেকআউট লোড করা যায়নি।"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCheckout();

    return () => {
      cancelled = true;
    };
  }, []);

  const cartDetails = cart.map((item) => {
    const product = products.find((p) => p.id === item.product_id);
    return {
      ...item,
      product,
      lineTotal: product ? Number(product.price) * item.quantity : 0,
    };
  });

  const total = cartDetails.reduce((sum, item) => sum + item.lineTotal, 0);

  const missingProducts = cartDetails.some(
    (item) =>
      !item.product ||
      !Number.isFinite(Number(item.product.price)) ||
      Number(item.product.price) < 0
  );

  const stockIssues = cartDetails.filter(
    (item) =>
      item.product &&
      typeof item.product.stock === "number" &&
      item.quantity > item.product.stock
  );

  const selectedMobilePayment =
    paymentMethod === "cod"
      ? null
      : paymentConfig?.paymentMethods?.[paymentMethod];

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");

    if (!cart.length) {
      setError("আপনার কার্ট খালি। আগে পণ্য যোগ করুন।");
      return;
    }

    if (missingProducts) {
      setError("কার্টের কিছু পণ্যের তথ্য পাওয়া যায়নি। আবার যাচাই করুন।");
      return;
    }

    if (stockIssues.length) {
      setError("কিছু পণ্যের মজুত পর্যাপ্ত নয়। পরিমাণ কমিয়ে আবার চেষ্টা করুন।");
      return;
    }

    if (paymentMethod !== "cod" && !selectedMobilePayment?.enabled) {
      setError("এই পেমেন্ট পদ্ধতির নম্বর লোড হয়নি। পরে আবার চেষ্টা করুন।");
      return;
    }

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    setSubmitting(true);
    const formData = new FormData(form);

    const transactionId = String(
      formData.get("payment_transaction_id") ?? ""
    ).trim();

    if (
      paymentMethod !== "cod" &&
      (!transactionId ||
        transactionId.length > 120 ||
        !/^[A-Za-z0-9-]+$/.test(transactionId))
    ) {
      setError("সঠিক Transaction ID দিন (ইংরেজি অক্ষর, সংখ্যা ও হাইফেন)।");
      setSubmitting(false);
      return;
    }

    const payload = {
      customer_name: String(formData.get("customer_name") ?? "").trim(),
      customer_phone: String(formData.get("customer_phone") ?? "").trim(),
      customer_email: String(formData.get("customer_email") ?? "").trim(),
      shipping_address: String(formData.get("shipping_address") ?? "").trim(),
      shipping_city: String(formData.get("shipping_city") ?? "").trim(),
      payment_method: paymentMethod,
      payment_transaction_id: paymentMethod === "cod" ? null : transactionId,
      items: cart.map(({ product_id, quantity }) => ({ product_id, quantity })),
    };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || result?.message || "অর্ডার তৈরি করা যায়নি।"
        );
      }

      const createdOrderNumber = result?.order?.order_number;

      if (typeof createdOrderNumber !== "string" || !createdOrderNumber) {
        throw new Error(
          "অর্ডারের নম্বর নিশ্চিত করা যায়নি। অর্ডারটি তৈরি হয়েছে কি না যাচাই করুন।"
        );
      }

      localStorage.removeItem("neweix_cart");
      setCart([]);
      setSubmittedPaymentMethod(paymentMethod);
      setOrderNumber(createdOrderNumber);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "সংযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const fieldStyle = {
    display: "block",
    width: "100%",
    boxSizing: "border-box" as const,
    margin: "8px 0 16px",
    padding: 12,
  };

  if (loading) {
    return (
      <main className="hero" aria-live="polite">
        <p>চেকআউট লোড হচ্ছে...</p>
      </main>
    );
  }

  if (orderNumber) {
    return (
      <main className="hero" style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
        <p className="eyebrow">ORDER RECEIVED</p>
        <h1>অর্ডার গ্রহণ করা হয়েছে!</h1>
        <p>আপনার অর্ডার নম্বর:</p>
        <h2 style={{ overflowWrap: "anywhere" }}>{orderNumber}</h2>

        {submittedPaymentMethod === "cod" ? (
          <p>পেমেন্ট পদ্ধতি: ক্যাশ অন ডেলিভারি (COD)।</p>
        ) : (
          <p role="status">
            পেমেন্টের Transaction ID জমা হয়েছে। পেমেন্ট যাচাই না হওয়া পর্যন্ত
            অর্ডারটি অপেক্ষমাণ থাকবে। টাকা পাঠানোর রসিদ সংরক্ষণ করুন।
          </p>
        )}

        <p>ডেলিভারি চার্জ আলাদাভাবে নিশ্চিত করা হবে।</p>
        <a className="primary-button" href="/">হোমপেজে ফিরুন</a>
      </main>
    );
  }

  if (cart.length === 0) {
    return (
      <main className="hero">
        <h1>আপনার কার্ট খালি</h1>
        {error && <p role="alert">{error}</p>}
        <a className="primary-button" href="/">পণ্য দেখুন</a>
      </main>
    );
  }

  return (
    <main className="hero" style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <p className="eyebrow">CHECKOUT</p>
      <h1>অর্ডার সম্পন্ন করুন</h1>
      <p>আপনার ডেলিভারি তথ্য ও পেমেন্ট পদ্ধতি নির্বাচন করুন।</p>

      <section
        aria-labelledby="summary-heading"
        style={{
          maxWidth: 620,
          margin: "24px auto",
          padding: 20,
          border: "1px solid #ddd",
          borderRadius: 12,
          textAlign: "left",
        }}
      >
        <h2 id="summary-heading">অর্ডারের বিবরণ</h2>

        {cartDetails.map((item) => (
          <div
            key={item.product_id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              padding: "12px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            <div>
              <p style={{ margin: 0 }}>{item.product?.name ?? "অজানা পণ্য"}</p>
              <small>
                {formatPrice(Number(item.product?.price ?? 0))} × {item.quantity}
              </small>
            </div>
            <strong style={{ whiteSpace: "nowrap" }}>
              {formatPrice(item.lineTotal)}
            </strong>
          </div>
        ))}

        <p><strong>পণ্যের মোট মূল্য: {formatPrice(total)}</strong></p>
        <p>ডেলিভারি চার্জ: এখনো হিসাব করা হয়নি; নিশ্চিত করে জানানো হবে।</p>

        {missingProducts && <p role="alert">কিছু পণ্যের তথ্য পাওয়া যায়নি।</p>}
        {stockIssues.length > 0 && <p role="alert">কিছু পণ্যের মজুত পর্যাপ্ত নয়।</p>}
      </section>

      <form
        onSubmit={submitOrder}
        style={{ maxWidth: 620, margin: "24px auto", textAlign: "left" }}
      >
        <label htmlFor="customer_name">আপনার নাম *</label>
        <input id="customer_name" name="customer_name" required minLength={2}
          maxLength={120} autoComplete="name" disabled={submitting} style={fieldStyle} />

        <label htmlFor="customer_phone">মোবাইল নম্বর *</label>
        <input id="customer_phone" name="customer_phone" type="tel" required
          minLength={7} maxLength={30} autoComplete="tel" disabled={submitting}
          placeholder="আপনার যোগাযোগের নম্বর" style={fieldStyle} />

        <label htmlFor="customer_email">ইমেইল (ঐচ্ছিক)</label>
        <input id="customer_email" name="customer_email" type="email"
          maxLength={254} autoComplete="email" disabled={submitting} style={fieldStyle} />

        <label htmlFor="shipping_address">সম্পূর্ণ ডেলিভারি ঠিকানা *</label>
        <textarea id="shipping_address" name="shipping_address" required
          minLength={5} maxLength={1000} autoComplete="street-address" rows={4}
          disabled={submitting} style={{ ...fieldStyle, resize: "vertical" }} />

        <label htmlFor="shipping_city">শহর / জেলা *</label>
        <input id="shipping_city" name="shipping_city" required minLength={2}
          maxLength={120} autoComplete="address-level2" disabled={submitting}
          placeholder="যেমন: ঢাকা" style={fieldStyle} />

        <fieldset style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, margin: "20px 0" }}>
          <legend>পেমেন্ট পদ্ধতি নির্বাচন করুন *</legend>

          {([
            ["cod", "Cash on Delivery (COD)"],
            ["bkash", "bKash"],
            ["nagad", "Nagad"],
            ["rocket", "Rocket"],
          ] as [PaymentMethod, string][]).map(([value, label]) => {
            const methodConfig =
              value === "cod" ? null : paymentConfig?.paymentMethods?.[value];

            return (
              <label key={value} style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
                <input
                  type="radio"
                  name="payment_method_choice"
                  value={value}
                  checked={paymentMethod === value}
                  onChange={() => setPaymentMethod(value)}
                  disabled={submitting || (value !== "cod" && !methodConfig?.enabled)}
                />
                <span>{label}</span>
                {value !== "cod" && !methodConfig?.enabled && (
                  <small>(এই মুহূর্তে অনুপলব্ধ)</small>
                )}
              </label>
            );
          })}

          {paymentConfigError && (
            <p role="alert">{paymentConfigError} COD নির্বাচন করে অর্ডার দিতে পারবেন।</p>
          )}

          {paymentMethod !== "cod" && selectedMobilePayment?.enabled && (
            <div style={{ padding: 14, background: "#f7f7f7", borderRadius: 8, marginTop: 12 }}>
              <h3>{selectedMobilePayment.label} পেমেন্ট</h3>
              <p>নিচের নম্বরে Send Money করুন:</p>
              <p style={{ fontSize: 20, fontWeight: 700, overflowWrap: "anywhere" }}>
                {selectedMobilePayment.number}
              </p>
              <p>
                টাকা পাঠানোর পর Transaction ID লিখুন। Transaction ID জমা দিলেই
                পেমেন্ট নিশ্চিত হবে না; যাচাই করা হবে।
              </p>
              <label htmlFor="payment_transaction_id">Transaction ID *</label>
              <input
                id="payment_transaction_id"
                name="payment_transaction_id"
                required
                minLength={1}
                maxLength={120}
                pattern="[A-Za-z0-9-]+"
                title="ইংরেজি অক্ষর, সংখ্যা ও হাইফেন ব্যবহার করুন"
                autoComplete="off"
                disabled={submitting}
                placeholder="যেমন: TXN123ABC"
                style={fieldStyle}
              />
            </div>
          )}
        </fieldset>

        <p><strong>পণ্যের মোট মূল্য: {formatPrice(total)}</strong></p>
        <p>চূড়ান্ত ডেলিভারি চার্জ পরে নিশ্চিত করা হবে।</p>

        {error && (
          <p role="alert" style={{ color: "crimson", padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || missingProducts || stockIssues.length > 0}
          style={{ width: "100%", padding: 14, cursor: submitting ? "wait" : "pointer" }}
        >
          {submitting ? "অর্ডার জমা হচ্ছে..." : "অর্ডার নিশ্চিত করুন"}
        </button>
      </form>

      <p><a href="/cart">← কার্টে ফিরে যান</a></p>
    </main>
  );
}
