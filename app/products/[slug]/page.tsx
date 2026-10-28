import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import AddToCartButton from "./AddToCartButton";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_urls: string[] | null;
  stock: number;
};

async function getProduct(slug: string): Promise<Product | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, description, price, compare_at_price, image_urls, stock")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Product page lookup failed:", error.message);
    return null;
  }
  return data as Product | null;
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(decodeURIComponent(slug));

  if (!product) notFound();

  const images = product.image_urls ?? [];
  const price = (n: number) => `${Number(n).toLocaleString("bn-BD")} ৳`;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <a href="/">← সব পণ্য</a>

      <div style={{ display: "grid", gap: 24, marginTop: 16 }}>
        {images.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {images.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt={product.name} style={{ width: "100%", borderRadius: 12 }} />
            ))}
          </div>
        )}

        <section>
          <h1>{product.name}</h1>
          <p style={{ fontSize: 24, fontWeight: 700 }}>
            {price(product.price)}{" "}
            {product.compare_at_price && product.compare_at_price > product.price && (
              <s style={{ fontSize: 16, opacity: 0.6 }}>{price(product.compare_at_price)}</s>
            )}
          </p>
          <p>{product.stock > 0 ? `স্টকে আছে: ${product.stock}` : "স্টক শেষ"}</p>
          {product.description && <p style={{ whiteSpace: "pre-wrap" }}>{product.description}</p>}

          <AddToCartButton productId={product.id} disabled={product.stock <= 0} maxQuantity={product.stock} />
        </section>
      </div>
    </main>
  );
}
