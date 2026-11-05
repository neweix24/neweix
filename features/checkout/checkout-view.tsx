"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import styles from "./checkout-view.module.css";

import { useEffect, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import BangladeshAddressFields from "@/features/checkout/bangladesh-address-fields";
import { useLanguage } from "@/components/language-provider";

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

type SavedAddress = {
  recipient_name: string;
  phone: string;
  address_line: string;
  area: string | null;
  upazila: string | null;
  district: string;
  division: string;
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

function formatPrice(price: number, locale: string): string {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", {
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
  const { locale } = useLanguage();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [defaultAddress, setDefaultAddress] = useState<SavedAddress | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [paymentConfigError, setPaymentConfigError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [mfsMethod, setMfsMethod] = useState<"bkash" | "nagad" | "rocket">("bkash");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deliveryFeeQuote, setDeliveryFeeQuote] = useState<number | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponError, setCouponError] = useState(false);
  const [couponPreview, setCouponPreview] = useState<{ code: string; discount: number; free_shipping: boolean } | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [submittedPaymentMethod, setSubmittedPaymentMethod] =
    useState<PaymentMethod>("cod");

  useEffect(() => {
    let cancelled = false;

    async function loadCheckout() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();

        // Guest checkout is supported. Phone verification is only required
        // to link an order to a registered customer account.
        if (!authError && authData.user) {
          const phoneResponse = await fetch("/api/account/phone/status", {
            cache: "no-store",
          });
          const phoneStatus = await phoneResponse.json().catch(() => null);

          if (phoneResponse.ok && phoneStatus?.verified && phoneStatus?.phone) {
            if (!cancelled) {
              setCustomerPhone(phoneStatus.phone);
              setPhoneVerified(true);
            }
          }
        }

        const isBuyNow = new URLSearchParams(window.location.search).get("buyNow") === "1";
        const saved = localStorage.getItem(isBuyNow ? "neweix_buy_now" : "neweix_cart");
        const parsed: unknown = saved ? JSON.parse(saved) : [];

        if (!Array.isArray(parsed)) {
          throw new Error("Invalid cart data.");
        }

        const merged = new Map<string, number>();

        for (const item of parsed.filter(isValidCartItem)) {
          const quantity = (merged.get(item.product_id) ?? 0) + item.quantity;

          if (quantity > 100) {
            throw new Error("The maximum quantity per product is 100.");
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
              throw new Error("Could not load payment details.");
            }
            return data as PaymentConfig;
          })
          .catch((err) => {
            if (!cancelled) {
              setPaymentConfigError(
                err instanceof Error
                  ? err.message
                  : "Could not load payment details."
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
                    throw new Error("Could not load product information.");
                  }
                  return data.data as Product[];
                }
              );

        const addressPromise = (async (): Promise<SavedAddress | null> => {
          try {
            const supabase = createBrowserSupabaseClient();
            const { data: authData } = await supabase.auth.getUser();
            if (!authData.user) return null;
            const { data, error } = await supabase
              .from("customer_addresses")
              .select("recipient_name,phone,address_line,area,upazila,district,division")
              .eq("user_id", authData.user.id)
              .order("is_default", { ascending: false })
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (error) return null;
            return data as SavedAddress | null;
          } catch {
            return null;
          }
        })();

        const [config, loadedProducts, savedAddress] = await Promise.all([
          configPromise,
          productsPromise,
          addressPromise,
        ]);

        if (!cancelled) {
          if (config) setPaymentConfig(config);
          if (loadedProducts) setProducts(loadedProducts);
          if (savedAddress) {
            setDefaultAddress(savedAddress);
            setCustomerPhone((current) => current || savedAddress.phone || "");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load checkout."
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
      ? paymentConfig?.paymentMethods?.[mfsMethod]
      : paymentConfig?.paymentMethods?.[paymentMethod];

  async function loadDeliveryQuote(districtCode: string, upazilaCode: string, couponCode = "") {
    if (!districtCode || !/^BD-D[0-9]{2}-Z[0-9]{2}-U[0-9]{3}$/.test(upazilaCode)) {
      setDeliveryFeeQuote(null);
      return null;
    }
    setDeliveryQuoteLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        district_code: districtCode,
        upazila_code: upazilaCode,
        subtotal: String(Math.round(total)),
        items: JSON.stringify(cart.map(({ product_id, quantity }) => ({ product_id, quantity }))),
        coupon_code: couponCode.trim().toUpperCase(),
      });
      const response = await fetch(`/api/delivery/quote?${params.toString()}`, { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Number.isFinite(Number(result?.delivery_fee))) {
        throw new Error(result?.error || "Could not calculate the live Pathao delivery fee.");
      }
      const fee = Number(result.delivery_fee);
      setDeliveryFeeQuote(fee);
      return fee;
    } catch (err) {
      setDeliveryFeeQuote(null);
      setError(err instanceof Error ? err.message : "Could not calculate the delivery fee.");
      return null;
    } finally {
      setDeliveryQuoteLoading(false);
    }
  }

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    setCouponMessage("");
    setCouponPreview(null);
    setCouponError(false);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      setCouponError(true);
      setCouponMessage("Enter a valid coupon code (3–40 letters, numbers, hyphens, or underscores).");
      return;
    }
    setCouponChecking(true);
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ code, subtotal: Math.round(total) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success || !result?.coupon) {
        throw new Error(result?.error || "This coupon could not be applied.");
      }
      const preview = result.coupon as { code: string; discount: number; free_shipping: boolean };
      if (typeof preview.discount !== "number" || !Number.isSafeInteger(preview.discount) || preview.discount < 0 || preview.discount > total) {
        throw new Error("The coupon preview returned an invalid discount.");
      }
      setCouponPreview(preview);
      setCouponMessage(preview.free_shipping
        ? "Coupon applied: free delivery will be confirmed when your order is placed."
        : `Coupon applied. You save ${formatPrice(preview.discount, locale)}.`);
    } catch (err) {
      setCouponError(true);
      setCouponMessage(err instanceof Error ? err.message : "Could not validate this coupon.");
    } finally {
      setCouponChecking(false);
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");

    if (!cart.length) {
      setError("Your cart is empty. Add a product before checkout.");
      return;
    }

    if (missingProducts) {
      setError("Some cart products could not be found. Please review your cart.");
      return;
    }

    if (stockIssues.length) {
      setError("Some products do not have enough stock. Reduce the quantity and try again.");
      return;
    }

    if (paymentMethod !== "cod" && !selectedMobilePayment?.enabled) {
      setError("Payment details for this method are unavailable. Please try again later.");
      return;
    }

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    setSubmitting(true);
    const formData = new FormData(form);
    const quote = await loadDeliveryQuote(
      String(formData.get("shipping_district_code") ?? ""),
      String(formData.get("shipping_upazila_code") ?? ""),
      String(formData.get("coupon_code") ?? ""),
    );
    if (quote === null) {
      setSubmitting(false);
      setError("Could not confirm the delivery fee. Check the city or district and try again.");
      return;
    }

    const transactionId = String(formData.get("payment_transaction_id") ?? "").trim();
    const deliveryFeeTransactionId = String(formData.get("delivery_fee_payment_transaction_id") ?? "").trim();

    if (paymentMethod === "cod" && quote > 0 &&
      (!selectedMobilePayment?.enabled || !deliveryFeeTransactionId || deliveryFeeTransactionId.length > 120 || !/^[A-Za-z0-9-]+$/.test(deliveryFeeTransactionId))) {
      setError("Enter a valid delivery-fee transaction ID.");
      setSubmitting(false);
      return;
    }
    if (paymentMethod !== "cod" &&
      (!transactionId || transactionId.length > 120 || !/^[A-Za-z0-9-]+$/.test(transactionId))) {
      setError("Enter a valid transaction ID using letters, numbers, and hyphens.");
      setSubmitting(false);
      return;
    }

    const payload = {
      customer_name: String(formData.get("customer_name") ?? "").trim(),
      customer_phone: customerPhone.trim(),
      customer_email: String(formData.get("customer_email") ?? "").trim(),
      shipping_address: String(formData.get("shipping_address") ?? "").trim(),
      shipping_city: String(formData.get("shipping_city") ?? "").trim(),
      shipping_division_code: String(formData.get("shipping_division_code") ?? ""),
      shipping_district_code: String(formData.get("shipping_district_code") ?? ""),
      shipping_upazila_code: String(formData.get("shipping_upazila_code") ?? ""),
      shipping_upazila_other: String(formData.get("shipping_upazila_other") ?? "").trim(),
      shipping_union_code: String(formData.get("shipping_union_code") ?? ""),
      shipping_union_other: String(formData.get("shipping_union_other") ?? "").trim(),
      shipping_village: String(formData.get("shipping_village") ?? "").trim(),
      coupon_code: String(formData.get("coupon_code") ?? "").trim().toUpperCase() || null,
      payment_method: paymentMethod,
      payment_transaction_id: paymentMethod === "cod" ? null : transactionId,
      delivery_fee_payment_method: paymentMethod === "cod" && quote > 0 ? mfsMethod : null,
      delivery_fee_payment_transaction_id: paymentMethod === "cod" && quote > 0 ? deliveryFeeTransactionId : null,
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
          result?.error || result?.message || "Could not create the order."
        );
      }

      const createdOrderNumber = result?.order?.order_number;

      if (typeof createdOrderNumber !== "string" || !createdOrderNumber) {
        throw new Error(
          "Could not confirm the order number. Please verify whether the order was created."
        );
      }

      if (new URLSearchParams(window.location.search).get("buyNow") === "1") {
        localStorage.removeItem("neweix_buy_now");
      } else {
        localStorage.removeItem("neweix_cart");
      }
      setCart([]);
      setSubmittedPaymentMethod(paymentMethod);
      setOrderNumber(createdOrderNumber);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "A connection error occurred. Please try again."
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
    padding: "13px 14px",
    color: "var(--ink)",
    background: "var(--surface-raised)",
    border: "1px solid var(--border)",
    borderRadius: 10,
  };

  if (loading) {
    return (
      <main className={styles.page} aria-live="polite">
        <p>Loading checkout...</p>
      </main>
    );
  }

  if (orderNumber) {
    return (
      <main className={styles.page}>
        <p className="eyebrow">ORDER RECEIVED</p>
        <h1>Your order has been received!</h1>
        <p>Your order number:</p>
        <h2 className={styles.orderNumber}>{orderNumber}</h2>

        {submittedPaymentMethod === "cod" ? (
          <p>Pay for the products on delivery. The mobile payment for the delivery fee is pending verification.</p>
        ) : (
          <p role="status">
            Your payment transaction ID has been submitted. Until the payment is verified,
            your order will remain pending. Keep your payment receipt.
          </p>
        )}

        <p>Delivery: Pathao Courier. An administrator must approve the booking.</p>
        <p>The delivery fee is shown in your order details.</p>
        <Link className="primary-button" href="/"><Icon name="home" size={17} /> Return to homepage</Link>
        <Link className={styles.secondaryLink} href="/track-order"><Icon name="truck" size={17} /> Track your order</Link>
      </main>
    );
  }

  if (cart.length === 0) {
    return (
      <main className={styles.page}>
        <h1>Your cart is empty</h1>
        {error && <p role="alert">{error}</p>}
        <Link className="primary-button" href="/"><Icon name="grid" size={17} /> Browse products</Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <p className="eyebrow">CHECKOUT</p>
      <h1>Complete your order</h1>
      <p>Enter your delivery details and choose a payment method.</p>

      <section aria-labelledby="summary-heading" className={styles.panel}>
        <h2 id="summary-heading">Order details</h2>

        {cartDetails.map((item) => (
          <div
            key={item.product_id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              padding: "12px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <p style={{ margin: 0 }}>{item.product?.name ?? "Unknown product"}</p>
              <small>
                {formatPrice(Number(item.product?.price ?? 0), locale)} × {item.quantity}
              </small>
            </div>
            <strong style={{ whiteSpace: "nowrap" }}>
              {formatPrice(item.lineTotal, locale)}
            </strong>
          </div>
        ))}

        <p><strong>Product subtotal: {formatPrice(total, locale)}</strong></p>
        {couponPreview && !couponPreview.free_shipping && (
          <p className={styles.discountRow}><span>Coupon savings</span><strong>−{formatPrice(couponPreview.discount, locale)}</strong></p>
        )}
        <p><strong>Estimated total: {formatPrice(Math.max(0, total - (couponPreview?.discount ?? 0)) + (couponPreview?.free_shipping ? 0 : (deliveryFeeQuote ?? 0)), locale)}</strong></p>
        <p>Delivery: Pathao Courier</p>
        <p>Delivery fee: {deliveryQuoteLoading ? "Calculating..." : deliveryFeeQuote === null ? "Select a supported upazila above to calculate the live Pathao fee." : couponPreview?.free_shipping ? "Free delivery (subject to server confirmation)" : formatPrice(deliveryFeeQuote, locale)}</p>

        {missingProducts && <p role="alert">Some product details are unavailable.</p>}
        {stockIssues.length > 0 && <p role="alert">Some products have insufficient stock.</p>}
      </section>

      <form onSubmit={submitOrder} className={styles.form}>
        {defaultAddress && (
          <p role="status">Your saved address has been prefilled. Edit it if needed.</p>
        )}
        <label htmlFor="customer_name">Full name *</label>
        <input id="customer_name" name="customer_name" required minLength={2}
          maxLength={120} autoComplete="name" defaultValue={defaultAddress?.recipient_name ?? ""} disabled={submitting} style={fieldStyle} />

        <label htmlFor="customer_phone">Mobile number *</label>
        <input id="customer_phone" name="customer_phone" type="tel" required
          autoComplete="tel" value={customerPhone}
          onChange={(event) => setCustomerPhone(event.target.value)}
          readOnly={phoneVerified} disabled={submitting}
          placeholder="01XXXXXXXXX" style={fieldStyle} />
        {phoneVerified && <small>Your verified account phone number is being used.</small>}
        {!phoneVerified && <small>You can order without an account. Enter a valid contact number.</small>}

        <label htmlFor="customer_email">Email (optional)</label>
        <input id="customer_email" name="customer_email" type="email"
          maxLength={254} autoComplete="email" disabled={submitting} style={fieldStyle} />

        <label htmlFor="shipping_address">House / road / detailed address *</label>
        <textarea id="shipping_address" name="shipping_address" required
          minLength={5} maxLength={1000} autoComplete="street-address" rows={3}
          defaultValue={defaultAddress?.address_line ?? ""}
          disabled={submitting} style={{ ...fieldStyle, resize: "vertical" }}
          placeholder="Enter your house number, road, flat, or a nearby landmark" />

        <BangladeshAddressFields
          initialDivision={defaultAddress?.division}
          initialDistrict={defaultAddress?.district}
          initialUpazila={defaultAddress?.upazila}
          initialVillage={defaultAddress?.area}
          disabled={submitting}
          onAddressChange={({ districtCode, upazilaCode }) => {
            if (districtCode && upazilaCode) void loadDeliveryQuote(districtCode, upazilaCode);
            else setDeliveryFeeQuote(null);
          }}
        />

        <label htmlFor="coupon_code">Coupon code (optional)</label>
        <div className={styles.couponEntry}>
          <input id="coupon_code" name="coupon_code" type="text" maxLength={40}
            pattern="[A-Za-z0-9_-]{3,40}" title="Use 3–40 letters, numbers, hyphens, or underscores"
            autoComplete="off" disabled={submitting} placeholder="Example: SAVE10" style={fieldStyle}
            value={couponCode}
            onChange={(event) => {
              setCouponCode(event.target.value.toUpperCase());
              setCouponPreview(null);
              setCouponMessage("");
              setCouponError(false);
            }}
            onBlur={(event) => {
              const form = event.currentTarget.form;
              const district = form?.elements.namedItem("shipping_district_code") as HTMLInputElement | null;
              const upazila = form?.elements.namedItem("shipping_upazila_code") as HTMLInputElement | null;
              void loadDeliveryQuote(district?.value ?? "", upazila?.value ?? "", event.currentTarget.value);
            }} />
          <button type="button" className={styles.couponButton}
            onClick={() => void applyCoupon()} disabled={submitting || couponChecking || !couponCode.trim()}>
            {couponChecking ? "Checking..." : couponPreview ? "Apply again" : "Apply coupon"}
          </button>
        </div>
        {couponMessage && <p role={couponError ? "alert" : "status"} className={couponError ? styles.couponError : styles.couponSuccess}>{couponMessage}</p>}
        {couponPreview && (
          <div className={styles.discountRow}>
            <span>{couponPreview.free_shipping ? "Free delivery coupon" : "Coupon discount"}</span>
            <strong>{couponPreview.free_shipping ? "Delivery fee waived at order confirmation" : `−${formatPrice(couponPreview.discount, locale)}`}</strong>
          </div>
        )}

        <section className={styles.paymentOptions} aria-labelledby="delivery-heading">
          <h2 id="delivery-heading">Delivery method</h2>
          <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
            <input type="radio" name="delivery_method" value="pathao" checked readOnly />
            <span><strong>Pathao Courier</strong> — Home delivery by courier</span>
          </label>
          <p>The live delivery fee is fetched from Pathao using your selected upazila and the verified parcel weight. An administrator will review and approve the parcel before booking.</p>
        </section>

        <fieldset className={styles.paymentOptions}>
          <legend>Choose a payment method *</legend>

          <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
            <input
              type="radio"
              name="payment_method_choice"
              value="cod"
              checked={paymentMethod === "cod"}
              onChange={() => setPaymentMethod("cod")}
              disabled={submitting}
            />
            <span><strong>1. Cash on Delivery (COD)</strong> — Pay when you receive your products</span>
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0" }}>
            <input
              type="radio"
              name="payment_method_choice"
              value="mfs"
              checked={paymentMethod !== "cod"}
              onChange={() => {
                setPaymentMethod(mfsMethod);
              }}
              disabled={submitting}
            />
            <span><strong>2. Mobile Financial Service (MFS)</strong></span>
          </label>

          <div style={{ margin: "8px 0 16px", padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
              <p style={{ marginTop: 0 }}>{paymentMethod === "cod" ? "Choose an MFS provider to pay the delivery fee in advance:" : "Choose an MFS provider:"}</p>
              {([
                ["bkash", "bKash"],
                ["nagad", "Nagad"],
                ["rocket", "Rocket"],
              ] as const).map(([value, label]) => {
                const methodConfig = paymentConfig?.paymentMethods?.[value];
                return (
                  <label key={value} style={{ display: "flex", gap: 10, alignItems: "center", margin: "10px 0" }}>
                    <input
                      type="radio"
                      name="mfs_provider"
                      value={value}
                      checked={mfsMethod === value}
                      onChange={() => {
                        setMfsMethod(value);
                      }}
                      disabled={submitting || !methodConfig?.enabled}
                    />
                    <span>{label}</span>
                    {!methodConfig?.enabled && <small>(Payment number not configured)</small>}
                  </label>
                );
              })}
          </div>

          {paymentConfigError && (
            <p role="alert">{paymentConfigError} You can choose Cash on Delivery for now.</p>
          )}

          {selectedMobilePayment?.enabled && (paymentMethod !== "cod" || (deliveryFeeQuote ?? 0) > 0) && (
            <div className={styles.paymentDetails}>
              <h3>{selectedMobilePayment.label} Payment</h3>
              <p>Send money to the number below:</p>
              <p style={{ fontSize: 20, fontWeight: 700, overflowWrap: "anywhere" }}>
                {selectedMobilePayment.number}
              </p>
              <p>
                {paymentMethod === "cod"
                  ? `Only the delivery fee ${deliveryFeeQuote === null ? "calculate using the address above" : formatPrice(deliveryFeeQuote, locale)} must be paid in advance. Pay for the products on delivery. An administrator will verify the transaction ID.`
                  : "Send the full order total, including products and delivery. An administrator will verify the transaction ID."}
              </p>
              <label htmlFor={paymentMethod === "cod" ? "delivery_fee_payment_transaction_id" : "payment_transaction_id"}>Transaction ID *</label>
              <input
                id={paymentMethod === "cod" ? "delivery_fee_payment_transaction_id" : "payment_transaction_id"}
                name={paymentMethod === "cod" ? "delivery_fee_payment_transaction_id" : "payment_transaction_id"}
                required={paymentMethod !== "cod" || (deliveryFeeQuote ?? 0) > 0}
                minLength={1}
                maxLength={120}
                pattern="[A-Za-z0-9-]+"
                title="Use letters, numbers, and hyphens."
                autoComplete="off"
                disabled={submitting}
                placeholder="Example: TXN123ABC"
                style={fieldStyle}
              />
            </div>
          )}
        </fieldset>

        <p><strong>Product subtotal: {formatPrice(total, locale)}</strong></p>
        <p><strong>Delivery fee: {deliveryFeeQuote === null ? "Calculate using your address" : formatPrice(deliveryFeeQuote, locale)}</strong></p>
        <p>{paymentMethod === "cod" ? "Cash on Delivery selected: pay only the delivery fee in advance via MFS; pay for the products upon delivery." : "MFS selected: the full product total and delivery fee must be paid in advance."}</p>
        <p>The server determines the delivery fee. Submitting a transaction ID does not confirm payment; an administrator must verify it.</p>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || missingProducts || stockIssues.length > 0}
          className={styles.submit}
        >
          <><Icon name={submitting ? "refresh" : "check"} size={18} /> {submitting ? "Submitting order..." : "Place order"}</>
        </button>
      </form>

      <p><Link href="/cart"><Icon name="cart" size={16} /> Return to cart</Link></p>
    </main>
  );
}
