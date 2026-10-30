import type { Metadata } from "next";
import CompareView from "@/features/compare/compare-view";

export const metadata: Metadata = {
  title: "পণ্য তুলনা | NEWEIX",
  description: "NEWEIX-এর পণ্যগুলোর দাম, স্টক ও বিবরণ পাশাপাশি তুলনা করুন।",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function ComparePage() {
  return <CompareView />;
}
