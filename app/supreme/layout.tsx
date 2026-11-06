import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Supreme Control",
  description: "Secure NEWEIX Supreme business control workspace.",
  manifest: "/supreme/manifest.webmanifest",
};

const sections = [
  { href: "/supreme", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/submissions", label: "Product submissions" },
  { href: "/admin/customers", label: "Customer CRM" },
  { href: "/admin/customer-data-requests", label: "Privacy requests" },
  { href: "/supreme/staff", label: "Staff & roles" },
  { href: "/supreme/eixpay", label: "EixPay" },
  { href: "/supreme/eixverse", label: "Campaigns" },
  { href: "/supreme/reviews", label: "Reviews" },
  { href: "/supreme/audit-logs", label: "Audit logs" },
  { href: "/supreme/system", label: "System monitor" },
];

export default async function SupremeLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(["supreme"]);

  return (
    <div className="premium-supreme-workspace min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <ServiceWorkerRegister />
      <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 94%, transparent)" }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/supreme" className="min-w-0" aria-label="NEWEIX Supreme Control home">
            <span className="block text-sm font-black tracking-[0.18em]" style={{ color: "var(--primary)" }}>NEWEIX</span>
            <span className="block text-xs font-semibold">SUPREME CONTROL</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>SUPREME · MFA</span>
            <span className="hidden text-xs sm:inline" style={{ color: "var(--muted, var(--ink))" }}>{staff.role}</span>
            <Link href="/" className="min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>Storefront</Link>
            <form action="/auth/logout" method="post">
              <button className="min-h-10 rounded-xl border px-3 text-sm font-semibold" style={{ borderColor: "var(--border)" }} type="submit">Log out</button>
            </form>
          </div>
        </div>
        <nav aria-label="Supreme management" className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
          {sections.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div>{children}</div>
      <footer className="border-t px-4 py-5 text-center text-xs" style={{ borderColor: "var(--border)", color: "var(--muted, var(--ink))" }}>
        NEWEIX Supreme Control · Restricted to authorized Supreme accounts
      </footer>
    </div>
  );
}
