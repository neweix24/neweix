export type PortalService = {
  title: string;
  description: string;
  href: string;
  eyebrow: string;
  icon: "shop" | "package" | "user" | "cart" | "shield" | "grid";
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
    title: "অ্যাডমিন কনসোল",
    description: "অনুমোদিত প্রশাসনিক কার্যক্রম ও স্টোর পরিচালনা করুন।",
    href: "/admin",
    eyebrow: "MANAGEMENT",
    icon: "shield",
    accent: "blue",
  },
  {
    title: "সুপ্রিম কন্ট্রোল",
    description: "সিস্টেম নিয়ন্ত্রণ ও সর্বোচ্চ পর্যায়ের প্রশাসনিক ব্যবস্থাপনা।",
    href: "/supreme",
    eyebrow: "SYSTEM CONTROL",
    icon: "grid",
    accent: "violet",
  },
];
