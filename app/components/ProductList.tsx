"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  image_urls: string[] | null;
  stock: number;
};

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        const response = await fetch("/api/products");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "পণ্য লোড করা যায়নি");
        }

        if (!cancelled) {
          setProducts(result.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("পণ্য লোড করা যায়নি। পরে আবার চেষ্টা করো।");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p>পণ্য লোড হচ্ছে...</p>;
  if (error) return <p role="alert">{error}</p>;

  if (products.length === 0) {
    return <p>এখনো কোনো সক্রিয় পণ্য যোগ করা হয়নি।</p>;
  }

  return (
    <section aria-label="পণ্যসমূহ">
      <h2>আমাদের পণ্য</h2>

      <div className="grid grid-cols-2 gap-4">
        {products.map((product) => (
          <article
            key={product.id}
            className="overflow-hidden rounded-xl border p-3"
          >
            {product.image_urls?.[0] && (
              <Image
                src={product.image_urls[0]}
                alt={product.name}
                width={600}
                height={600}
                unoptimized
                className="mb-2 aspect-square w-full rounded-lg object-cover"
                loading="lazy"
              />
            )}

            <h3>{product.name}</h3>
            <p>{Number(product.price).toLocaleString("bn-BD")} ৳</p>
            <p>
              {product.stock > 0
                ? `স্টকে আছে: ${product.stock}`
                : "স্টক শেষ"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}