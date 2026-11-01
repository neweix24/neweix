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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
      <button type="button" disabled={unavailable} onClick={addToCart}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, padding: "9px 10px", borderRadius: 10, border: "1px solid var(--page-border, var(--border))", background: "var(--page-panel, var(--surface))", color: "inherit", fontWeight: 700, fontSize: 12, cursor: unavailable ? "not-allowed" : "pointer", opacity: unavailable ? .55 : 1 }}>
        <Icon name="cart" size={16} /> {t("addToCart")}
      </button>
      <button type="button" disabled={unavailable} onClick={buyNow}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, padding: "9px 10px", borderRadius: 10, border: "1px solid var(--page-accent, var(--primary))", background: "var(--page-accent, var(--primary))", color: "var(--accent-ink, #080b09)", fontWeight: 800, fontSize: 12, cursor: unavailable ? "not-allowed" : "pointer", opacity: unavailable ? .55 : 1 }}>
        <Icon name="sparkles" size={16} /> {t("buyNow")}
      </button>
      {message && <p role="status" aria-live="polite" style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12 }}>{message}</p>}
    </div>
  );
}
