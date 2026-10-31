"use client";

import Link from "next/link";
import Icon from "@/components/ui/icon";
import { useState } from "react";

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

  function add() {
    if (disabled || !Number.isSafeInteger(maxQuantity) || maxQuantity < 1) {
      setMessage("পণ্যটি বর্তমানে স্টকে নেই।");
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
        setMessage("স্টকে থাকা সর্বোচ্চ পরিমাণ ইতিমধ্যে কার্টে আছে।");
        return;
      }

      merged.set(productId, current + 1);
      const cart = Array.from(merged, ([product_id, quantity]) => ({ product_id, quantity }));
      localStorage.setItem("neweix_cart", JSON.stringify(cart));
      setMessage("কার্টে যোগ হয়েছে।");
    } catch {
      setMessage("কার্টে যোগ করা যায়নি। আবার চেষ্টা করুন।");
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button type="button" className="primary-button" onClick={add} disabled={disabled}>
        {disabled ? "স্টক শেষ" : <><Icon name="cart" size={18} /> কার্টে যোগ করুন</>}
      </button>{" "}
      <Link href="/cart"><Icon name="cart" size={16} /> কার্ট দেখুন</Link>
      {message && <p role="status" aria-live="polite">{message}</p>}
    </div>
  );
}