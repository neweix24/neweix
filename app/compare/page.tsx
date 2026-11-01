import type { Metadata } from "next";
import CompareView from "@/features/compare/compare-view";

export const metadata: Metadata = {
  title: "Product Comparison | NEWEIX",
  description: "Compare NEWEIX product prices, stock, and details side by side.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function ComparePage() {
  return <CompareView />;
}
