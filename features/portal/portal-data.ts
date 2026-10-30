export type PortalService = {
  title: string;
  description: string;
  href: string;
  eyebrow: string;
  icon: "shop" | "package" | "user" | "cart" | "shield" | "grid" | "staff";
  accent: "lime" | "blue" | "violet" | "amber";
};

export const portalServices: PortalService[] = [
  {
    title: "অনলাইন শপ",
    description: "পণ্য আবিষ্কার করুন, বিস্তারিত দেখুন এবং সহজে অর্ডার করুন।",
    href: "/products",
    eyebrow: "SHOPPING",
    icon: "shop",
    accent: "lime",
  },
  {
    title: "অর্ডার ট্র্যাকিং",
    description: "আপনার অর্ডারের বর্তমান অবস্থা ও ডেলিভারি অগ্রগতি জানুন।",
    href: "/track-order",
    eyebrow: "DELIVERY",
    icon: "package",
    accent: "blue",
  },
  {
    title: "কাস্টমার অ্যাকাউন্ট",
    description: "আপনার প্রোফাইল, অর্ডার এবং ব্যক্তিগত তথ্য পরিচালনা করুন।",
    href: "/account",
    eyebrow: "MY ACCOUNT",
    icon: "user",
    accent: "violet",
  },
  {
    title: "শপিং কার্ট",
    description: "নির্বাচিত পণ্য দেখুন এবং Checkout সম্পন্ন করুন।",
    href: "/cart",
    eyebrow: "YOUR CART",
    icon: "cart",
    accent: "amber",
  },
  {
    title: "স্টাফ ওয়ার্কস্পেস",
    description: "অনুমোদিত স্টাফ অ্যাকাউন্ট দিয়ে পণ্য ও স্টকের তথ্য দেখুন।",
    href: "/staff",
    eyebrow: "STAFF ACCESS",
    icon: "staff",
    accent: "amber",
  },
  {
    title: "অ্যাডমিন কনসোল",
    description: "শুধুমাত্র অনুমোদিত Admin ও Supreme অ্যাকাউন্টের জন্য।",
    href: "/admin",
    eyebrow: "RESTRICTED MANAGEMENT",
    icon: "shield",
    accent: "blue",
  },
  {
    title: "সুপ্রিম কন্ট্রোল",
    description: "শুধুমাত্র Supreme অনুমতিপ্রাপ্ত অ্যাকাউন্টের জন্য সংরক্ষিত।",
    href: "/supreme",
    eyebrow: "SYSTEM CONTROL",
    icon: "grid",
    accent: "violet",
  },
];
