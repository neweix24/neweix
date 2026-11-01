import type { Metadata } from "next";
import WishlistView from "@/features/wishlist/wishlist-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Wishlist | NEWEIX",
  description: "Your saved NEWEIX products.",
  robots: { index: false, follow: false },
};

export default function WishlistPage() {
  return <WishlistView />;
}
