"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/ui/icon";
import styles from "./supreme-workspace-navigation.module.css";

const sections = [
  { href: "/supreme", label: "Overview" },
  { href: "/admin/orders", label: "Orders & Payments" },
  { href: "/admin/products", label: "Products & Stock" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/submissions", label: "Product submissions" },
  { href: "/admin/customers", label: "Customer CRM" },
  { href: "/admin/customer-data-requests", label: "Privacy requests" },
  { href: "/supreme/staff", label: "Staff & roles" },
  { href: "/supreme/manager-nominations", label: "Manager approvals" },
  { href: "/supreme/finance/expenses", label: "Finance & Expenses" },
  { href: "/supreme/eixpay", label: "EixPay" },
  { href: "/supreme/eixverse", label: "Campaigns" },
  { href: "/supreme/reviews", label: "Reviews" },
  { href: "/supreme/audit-logs", label: "Audit logs" },
  { href: "/supreme/system", label: "System monitor" },
];

export default function SupremeWorkspaceNavigation() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.topRow}>
          <Link href="/supreme" className={styles.brand} aria-label="NEWEIX Supreme dashboard">
            <span>NEWEIX</span>
            <small>SUPREME CONTROL</small>
          </Link>
          <div className={styles.actions}>
            <Link
              href="/supreme/audit-logs"
              className={styles.iconButton}
              aria-label="Notifications and recent activity"
              title="Notifications and recent activity"
            >
              <Icon name="bell" size={21} />
            </Link>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={menuOpen ? "Close Supreme menu" : "Open Supreme menu"}
              aria-expanded={menuOpen}
              aria-controls="supreme-navigation-drawer"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? "close" : "menu"} size={22} />
            </button>
          </div>
        </div>

        <div className={styles.searchRow}>
          <Link href="/search" className={styles.searchLink} aria-label="Open search page">
            <Icon name="search" size={19} />
            <span>পণ্য, ব্র্যান্ড বা ক্যাটাগরি খুঁজুন...</span>
            <span className={styles.searchAction}>খুঁজুন <Icon name="arrow-right" size={16} /></span>
          </Link>
        </div>

        {menuOpen && (
          <>
            <button
              type="button"
              className={styles.scrim}
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            />
            <nav id="supreme-navigation-drawer" className={styles.drawer} aria-label="Supreme management menu">
              <div className={styles.drawerHeading}>
                <div><strong>Supreme Menu</strong><span>Management workspace</span></div>
                <button type="button" className={styles.drawerClose} onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div className={styles.drawerLinks}>
                {sections.map((item) => {
                  const active = item.href === "/supreme" ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={active ? styles.drawerLinkActive : styles.drawerLink}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>{item.label}</span><Icon name="chevron-right" size={17} />
                    </Link>
                  );
                })}
              </div>
              <div className={styles.drawerFooter}>
                <Link href="/" onClick={() => setMenuOpen(false)}>Visit storefront</Link>
                <form action="/auth/logout" method="post">
                  <button type="submit"><Icon name="logout" size={16} /> Log out</button>
                </form>
              </div>
            </nav>
          </>
        )}
      </header>

      <nav className={styles.bottomNav} aria-label="Supreme primary navigation">
        <Link href="/" className={styles.bottomItem}>
          <Icon name="home" size={21} />
          <span>Home</span>
        </Link>
        <Link href="/supreme" className={pathname.startsWith("/supreme") ? styles.bottomItemActive : styles.bottomItem} aria-current={pathname.startsWith("/supreme") ? "page" : undefined}>
          <Icon name="shield" size={21} />
          <span>Supreme Account</span>
        </Link>
      </nav>
    </>
  );
}
