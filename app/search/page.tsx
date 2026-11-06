import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import SmartSearchPanel from "@/features/products/smart-search-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Product Search | NEWEIX",
  description: "Find products by name, SKU, or natural-language description.",
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <main className="premium-search-page min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm font-black tracking-widest" style={{ color: "var(--ink)" }}>NEWEIX</Link>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <Link href="/products" style={{ color: "#34734b" }}>All products</Link>
            <Link href="/cart" className="inline-flex items-center gap-2" style={{ color: "#34734b" }}><Icon name="cart" size={16} /> Cart</Link>
          </div>
        </nav>
        <SmartSearchPanel />
      </div>
    </main>
  );
}
