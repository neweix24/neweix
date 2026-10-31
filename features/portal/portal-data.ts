export type PortalService = {
  title: string;
  description: string;
  href: string;
  icon: "shop" | "package" | "user" | "cart" | "shield" | "grid" | "staff" | "heart";
  accent: "lime" | "blue" | "violet" | "amber";
};

// Public customer-facing shortcuts only. Staff/admin controls stay inside authenticated workspaces.
export const portalServices: PortalService[] = [
  { title: "অনলাইন শপ", description: "পণ্য আবিষ্কার করুন এবং সহজে অর্ডার করুন।", href: "/products", icon: "shop", accent: "lime" },
  { title: "অর্ডার ট্র্যাকিং", description: "অর্ডারের অবস্থা ও ডেলিভারি অগ্রগতি জানুন।", href: "/track-order", icon: "package", accent: "blue" },
  { title: "আমার অ্যাকাউন্ট", description: "প্রোফাইল ও অর্ডার পরিচালনা করুন।", href: "/account", icon: "user", accent: "violet" },
  { title: "শপিং কার্ট", description: "নির্বাচিত পণ্য ও Checkout দেখুন।", href: "/cart", icon: "cart", accent: "amber" },
  { title: "পছন্দের তালিকা", description: "পছন্দের পণ্য সংরক্ষণ করুন।", href: "/wishlist", icon: "heart", accent: "violet" },
];
