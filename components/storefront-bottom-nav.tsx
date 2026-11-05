"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/icon";
import { useLanguage } from "@/components/language-provider";
import styles from "./storefront-bottom-nav.module.css";

function getCartCount() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("neweix_cart") ?? "[]");
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce((total, value) => {
      if (!value || typeof value !== "object") return total;
      const item = value as Record<string, unknown>;
      return total + (typeof item.product_id === "string" && Number.isSafeInteger(item.quantity) && Number(item.quantity) > 0 ? Number(item.quantity) : 0);
    }, 0);
  } catch { return 0; }
}

export default function StorefrontBottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [cartCount, setCartCount] = useState(0);

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

  const links = [
    { href: "/", label: t("homeNav"), icon: "home" },
    { href: "/products", label: t("productsSearch"), icon: "grid" },
    { href: "/cart", label: t("cart"), icon: "cart" },
    { href: "/account", label: t("myAccountNav"), icon: "user" },
  ] as const;

  return (
    <nav className={styles.navigation} aria-label="Main navigation">
      {links.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? styles.active : undefined}>
            <span className={styles.iconWrap}>
              <Icon name={item.icon} size={21} />
              {item.href === "/cart" && cartCount > 0 && <b>{cartCount > 99 ? "99+" : cartCount}</b>}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
