"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Account pages are a focused customer workspace. Leaving that workspace with
 * the browser Back action returns customers to the storefront instead of
 * exposing an old sign-in/redirect entry from the authentication history.
 */
export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  useEffect(() => {
    // Add a guard entry for the current account route. When Back is pressed,
    // the popstate handler replaces the destination with the storefront.
    window.history.pushState(
      { ...(window.history.state ?? {}), neweixAccountHistoryGuard: true },
      "",
      window.location.href
    );

    const handleAccountBack = () => {
      window.location.replace("/");
    };

    window.addEventListener("popstate", handleAccountBack);
    return () => window.removeEventListener("popstate", handleAccountBack);
  }, [pathname]);

  return children;
}
