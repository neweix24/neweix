export type PortalService = {
  title: string;
  description: string;
  href: string;
  eyebrow: string;
  icon: "shop" | "package" | "user" | "cart" | "shield" | "grid" | "staff" | "heart";
  accent: "lime" | "blue" | "violet" | "amber";
};

export const portalServices: PortalService[] = [
  {
    title: "Online Store",
    description: "Discover products, explore details, and order with ease.",
    href: "/products",
    eyebrow: "SHOPPING",
    icon: "shop",
    accent: "lime",
  },
  {
    title: "Order Tracking",
    description: "Check your order status and delivery progress.",
    href: "/track-order",
    eyebrow: "DELIVERY",
    icon: "package",
    accent: "blue",
  },
  {
    title: "Customer Account",
    description: "Manage your profile, orders, and personal information.",
    href: "/account",
    eyebrow: "MY ACCOUNT",
    icon: "user",
    accent: "violet",
  },
  {
    title: "Shopping Cart",
    description: "Review selected products and complete checkout.",
    href: "/cart",
    eyebrow: "YOUR CART",
    icon: "cart",
    accent: "amber",
  },
  {
    title: "Wishlist",
    description: "Save your favorite products and find them easily later.",
    href: "/wishlist",
    eyebrow: "WISHLIST",
    icon: "heart",
    accent: "violet",
  },
  {
    title: "Staff Workspace",
    description: "View product and stock information with an authorized staff account.",
    href: "/staff",
    eyebrow: "STAFF ACCESS",
    icon: "staff",
    accent: "amber",
  },
  {
    title: "Admin Console",
    description: "For authorized Admin and Supreme accounts only.",
    href: "/admin",
    eyebrow: "RESTRICTED MANAGEMENT",
    icon: "shield",
    accent: "blue",
  },
  {
    title: "Supreme Control",
    description: "Reserved for accounts with Supreme privileges only.",
    href: "/supreme",
    eyebrow: "SYSTEM CONTROL",
    icon: "grid",
    accent: "violet",
  },
];
