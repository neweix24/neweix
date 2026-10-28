"use client";

import { useState } from "react";

type CartItem = { product_id: string; quantity: number };

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
    try {
      const saved = localStorage.getItem("neweix_cart");
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      const cart: CartItem[] = Array.isArray(parsed) ? (parsed as CartItem[]) : [];
      const existing = cart.find((i) => i.product_id === productId);

      if (existing) {
        existing.quantity = Math.min(existing.quantity + 1, maxQuantity, 100);
      } else {
        cart.push({ product_id: productId, quantity: 1 });
      }

      localStorage.setItem("neweix_cart", JSON.stringify(cart));
      setMessage("কার্টে যোগ হয়েছে।");
    } catch {
      setMessage("কার্টে যোগ করা যায়নি।");
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button type="button" className="primary-button" onClick={add} disabled={disabled}>
        {disabled ? "স্টক শেষ" : "কার্টে যোগ করুন"}
      </button>{" "}
      <a href="/cart">কার্ট দেখুন</a>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
