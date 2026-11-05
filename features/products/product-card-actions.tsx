"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/ui/icon";
import { useLanguage } from "@/components/language-provider";

type CartItem = { product_id: string; quantity: number };

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.product_id === "string" && item.product_id.length > 0 &&
    Number.isSafeInteger(item.quantity) && Number(item.quantity) > 0 && Number(item.quantity) <= 100;
}

export default function ProductCardActions({
  productId,
  stock,
  onNotice,
}: {
  productId: string;
  stock: number;
  onNotice?: (message: string) => void;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [message, setMessage] = useState("");
  const notify = (value: string) => {
    setMessage(value);
    onNotice?.(value);
  };
  const unavailable = !Number.isSafeInteger(Number(stock)) || Number(stock) < 1;

  function addToCart() {
    if (unavailable) return notify(t("unavailable"));
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem("neweix_cart") ?? "[]");
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");
      const quantities = new Map<string, number>();
      for (const value of parsed.filter(isCartItem)) {
        quantities.set(value.product_id, Math.min(100, (quantities.get(value.product_id) ?? 0) + value.quantity));
      }
      const current = quantities.get(productId) ?? 0;
      if (current >= Math.min(100, Number(stock))) return notify(t("maxStock"));
      quantities.set(productId, current + 1);
      localStorage.setItem("neweix_cart", JSON.stringify(Array.from(quantities, ([product_id, quantity]) => ({ product_id, quantity }))));
      window.dispatchEvent(new Event("neweix-cart-change"));
      notify(t("cartAdded"));
    } catch {
      notify(t("cartFailed"));
    }
  }

  function buyNow() {
    if (unavailable) return notify(t("unavailable"));
    try {
      localStorage.setItem("neweix_buy_now", JSON.stringify([{ product_id: productId, quantity: 1 }]));
      router.push("/checkout?buyNow=1");
    } catch {
      notify(t("buyNowError"));
    }
  }

  return (
    <div className="product-card-actions" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
      <button
        className="product-card-action"
        type="button"
        disabled={unavailable}
        onClick={addToCart}
        aria-label={t("addToCart")}
        title={t("addToCart")}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, minWidth: 44, minHeight: 42, padding: 0, borderRadius: 12, border: "1px solid #d7e4da", background: "#f4f8f4", color: "#236342", cursor: unavailable ? "not-allowed" : "pointer", opacity: unavailable ? .5 : 1 }}
      >
        <Icon name="cart" size={19} />
      </button>
      <button
        className="product-card-action product-card-action-primary"
        type="button"
        disabled={unavailable}
        onClick={buyNow}
        aria-label={t("buyNow")}
        title={t("buyNow")}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, minWidth: 44, minHeight: 42, padding: 0, borderRadius: 12, border: "1px solid #176b43", background: "#176b43", color: "#fff", cursor: unavailable ? "not-allowed" : "pointer", opacity: unavailable ? .5 : 1 }}
      >
        <Icon name="sparkles" size={18} />
      </button>
      {message && <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 11, color: "var(--muted)" }}>{message}</p>}
    </div>
  );
}
