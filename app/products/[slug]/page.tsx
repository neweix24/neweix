import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import ProductDetails, { type ProductDetailsData } from "@/features/products/product-details";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function getProduct(slug: string): Promise<ProductDetailsData | null> {
  const { env } = getCloudflareContext();
  const runtimeEnv = env as Record<string, string | undefined>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from("products")
    .select("id, name, slug, description, price, compare_at_price, image_urls, video_url, variants, sku, stock, category_id")
    .eq("slug", slug).eq("is_active", true).maybeSingle();
  if (error) {
    console.error("Product page lookup failed:", error.message);
    return null;
  }
  return data as ProductDetailsData | null;
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();
  return <ProductDetails product={product} />;
}
