"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/language-provider";

type CartItem = { product_id: string; quantity: number };

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.product_id === "string" &&
    item.product_id.length > 0 &&
    Number.isSafeInteger(item.quantity) &&
    Number(item.quantity) > 0 &&
    Number(item.quantity) <= 100;
}

export default function AddToCartButton({
  productId,
  disabled,
  maxQuantity,
}: {
  productId: string;
  disabled: boolean;
  maxQuantity: number;
}) {
  const [message, setMessage] = useState("");
  const { t } = useLanguage();
  const router = useRouter();

  function add() {
    if (disabled || !Number.isSafeInteger(maxQuantity) || maxQuantity < 1) {
      setMessage(t("unavailable"));
      return;
    }

    try {
      const saved = localStorage.getItem("neweix_cart");
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");

      const merged = new Map<string, number>();
      for (const item of parsed.filter(isCartItem)) {
        merged.set(item.product_id, Math.min(100, (merged.get(item.product_id) ?? 0) + item.quantity));
      }

      const current = merged.get(productId) ?? 0;
      if (current >= Math.min(maxQuantity, 100)) {
        setMessage(t("maxStock"));
        return;
      }

      merged.set(productId, current + 1);
      const cart = Array.from(merged, ([product_id, quantity]) => ({ product_id, quantity }));
      localStorage.setItem("neweix_cart", JSON.stringify(cart));
      window.dispatchEvent(new Event("neweix-cart-change"));
      setMessage(t("cartAdded"));
    } catch {
      setMessage(t("addToCartError"));
    }
  }

  function buyNow() {
    if (disabled || !Number.isSafeInteger(maxQuantity) || maxQuantity < 1) {
      setMessage(t("unavailable"));
      return;
    }
    try {
      const saved = localStorage.getItem("neweix_cart");
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) throw new Error("Invalid cart");
      const merged = new Map<string, number>();
      for (const item of parsed.filter(isCartItem)) {
        merged.set(item.product_id, Math.min(100, (merged.get(item.product_id) ?? 0) + item.quantity));
      }
      const current = merged.get(productId) ?? 0;
      if (current < 1) merged.set(productId, 1);
      else merged.set(productId, Math.min(current, maxQuantity, 100));
      const cart = Array.from(merged, ([product_id, quantity]) => ({ product_id, quantity }));
      localStorage.setItem("neweix_cart", JSON.stringify(cart));
      window.dispatchEvent(new Event("neweix-cart-change"));
      router.push("/cart");
    } catch {
      setMessage(t("buyNowError"));
    }
  }

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
      <button type="button" className="primary-button" onClick={add} disabled={disabled}>
        {disabled ? t("outOfStock") : <><Icon name="cart" size={18} /> {t("addToCart")}</> }
      </button>
      <button type="button" className="primary-button" onClick={buyNow} disabled={disabled} style={{ background: "transparent", color: "var(--primary)", marginTop: 0 }}>
        <Icon name="sparkles" size={18} /> {t("buyNow")}
      </button>
      <Link href="/cart"><Icon name="cart" size={16} /> {t("cart")} </Link>
      {message && <p role="status" aria-live="polite">{message}</p>}
    </div>
  );
}