"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/ui/icon";
import { useLanguage } from "@/components/language-provider";

function getCartCount() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("neweix_cart") ?? "[]");
    if (!Array.isArray(value)) return 0;
    return value.reduce((sum, item) => {
      if (!item || typeof item !== "object") return sum;
      const row = item as Record<string, unknown>;
      return sum + (typeof row.product_id === "string" && Number.isSafeInteger(row.quantity) && Number(row.quantity) > 0 ? Number(row.quantity) : 0);
    }, 0);
  } catch { return 0; }
}
const excludedRoots = ["/admin", "/supreme", "/staff", "/manager", "/employee", "/auth"];

export default function StorefrontNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [cartCount, setCartCount] = useState(0);
  const isStorefront = !excludedRoots.some((root) => pathname === root || pathname.startsWith(root + "/"));
  useEffect(() => {
    const refresh = () => setCartCount(getCartCount());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("neweix-cart-change", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("neweix-cart-change", refresh);
    };
  }, [pathname]);
  if (!isStorefront) return <>{children}</>;
  const links: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: t("homeNav"), icon: "home" },
    { href: "/products", label: t("productsSearch"), icon: "grid" },
    { href: "/cart", label: t("cart"), icon: "cart" },
    { href: "/account", label: t("myAccountNav"), icon: "user" },
  ];
  return (
    <div className="neweix-storefront-shell">
      {children}
      <nav className="neweix-storefront-bottom-nav" aria-label="Main navigation">
        {links.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "is-active" : undefined}>
            <span className="neweix-storefront-nav-icon"><Icon name={item.icon} size={21} />{item.href === "/cart" && cartCount > 0 && <b>{cartCount > 99 ? "99+" : cartCount}</b>}</span>
            <span className="neweix-storefront-nav-label">{item.label}</span>
          </Link>;
        })}
      </nav>
    </div>
  );
}
