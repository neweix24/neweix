"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  price: number;
  image_urls: string[] | null;
  stock: number;
};

type CartItem = {
  product_id: string;
  quantity: number;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function CartView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("neweix_cart");
      const parsed = saved ? JSON.parse(saved) : [];

      if (Array.isArray(parsed)) {
        setCart(
          parsed.filter(
            (item): item is CartItem =>
              item !== null &&
              typeof item === "object" &&
              typeof item.product_id === "string" &&
              Number.isSafeInteger(item.quantity) &&
              item.quantity > 0
          )
        );
      }
    } catch {
      setCart([]);
      setError("কার্টের তথ্য পড়া যায়নি।");
    }

    async function loadProducts() {
      try {
        const response = await fetch("/api/products");
        const result = await response.json();

        if (!response.ok) {
          throw new Error("পণ্য লোড করা যায়নি");
        }

        setProducts(result.data ?? []);
      } catch {
        setError("পণ্যের তথ্য লোড হয়নি। পরে আবার চেষ্টা করুন।");
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  function saveCart(nextCart: CartItem[]) {
    setCart(nextCart);
    localStorage.setItem("neweix_cart", JSON.stringify(nextCart));
  }

  function changeQuantity(product: Product, change: number) {
    const item = cart.find(
      (entry) => entry.product_id === product.id
    );

    if (!item) return;

    const nextQuantity = item.quantity + change;

    if (nextQuantity < 1) {
      saveCart(
        cart.filter((entry) => entry.product_id !== product.id)
      );
      return;
    }

    if (nextQuantity > product.stock) {
      alert("স্টকে এত পরিমাণ পণ্য নেই।");
      return;
    }

    saveCart(
      cart.map((entry) =>
        entry.product_id === product.id
          ? { ...entry, quantity: nextQuantity }
          : entry
      )
    );
  }

  const items = cart.flatMap((entry) => {
    const product = products.find(
      (p) => p.id === entry.product_id
    );

    return product
      ? [{ product, quantity: entry.quantity }]
      : [];
  });

  const total = items.reduce(
    (sum, item) =>
      sum + Number(item.product.price) * item.quantity,
    0
  );

  return (
    <main className="hero">
      <p className="eyebrow">YOUR CART</p>
      <h1>আপনার কার্ট</h1>

      {loading && <p>কার্ট লোড হচ্ছে...</p>}

      {!loading && error && (
        <p role="alert">{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <>
          <p className="hero-copy">
            আপনার কার্ট এখন খালি।
          </p>

          <Link className="primary-button" href="/">
            পণ্য দেখুন ↗
          </Link>
        </>
      )}

      {!loading && !error && items.length > 0 && (
        <section>
          {items.map(({ product, quantity }) => (
            <article
              key={product.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 0",
                borderBottom: "1px solid #ddd",
              }}
            >
              {product.image_urls?.[0] && (
                <img
                  src={product.image_urls[0]}
                  alt={product.name}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
              )}

              <div style={{ flex: 1 }}>
                <h3>{product.name}</h3>

                <p>
                  {formatPrice(Number(product.price))}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      changeQuantity(product, -1)
                    }
                  >
                    −
                  </button>

                  <span>{quantity}</span>

                  <button
                    type="button"
                    disabled={quantity >= product.stock}
                    onClick={() =>
                      changeQuantity(product, 1)
                    }
                  >
                    +
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      saveCart(
                        cart.filter(
                          (entry) =>
                            entry.product_id !== product.id
                        )
                      )
                    }
                  >
                    সরান
                  </button>
                </div>
              </div>

              <strong>
                {formatPrice(
                  Number(product.price) * quantity
                )}
              </strong>
            </article>
          ))}

          <h2>মোট: {formatPrice(total)}</h2>

          <p>
            ডেলিভারি চার্জ চেকআউটের সময় নিশ্চিত করা হবে।
          </p>

          <Link
            className="primary-button"
            href="/checkout"
          >
            অর্ডার করতে এগিয়ে যান →
          </Link>

          <p>
            <Link href="/">আরও পণ্য দেখুন</Link>
          </p>
        </section>
      )}
    </main>
  );
}