import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

const sections = [
  { href: "/supreme", label: "ড্যাশবোর্ড" },
  { href: "/admin/orders", label: "অর্ডার ও পেমেন্ট" },
  { href: "/admin/products", label: "পণ্য ব্যবস্থাপনা" },
  { href: "/admin/inventory", label: "স্টক ও ইনভেন্টরি" },
  { href: "/admin/categories", label: "ক্যাটাগরি" },
  { href: "/admin/submissions", label: "পণ্য প্রস্তাব" },
  { href: "/admin/customers", label: "গ্রাহক ও CRM" },
  { href: "/admin/customer-data-requests", label: "গ্রাহক ডেটা অনুরোধ" },
  { href: "/supreme/staff", label: "Admin ও Staff অ্যাকাউন্ট" },
  { href: "/supreme/audit-logs", label: "অডিট লগ" },
  { href: "/supreme/system", label: "সিস্টেম মনিটর" },
];

export default async function SupremeLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(["supreme"]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 94%, transparent)" }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/supreme" className="min-w-0">
            <span className="block text-sm font-black tracking-[0.18em]" style={{ color: "var(--primary)" }}>NEWEIX</span>
            <span className="block text-xs font-semibold">SUPREME CONTROL APP</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>SUPREME · MFA</span>
            <form action="/auth/logout" method="post">
              <button className="min-h-10 rounded-xl border px-3 text-sm font-semibold" style={{ borderColor: "var(--border)" }} type="submit">লগআউট</button>
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
        NEWEIX Supreme Control · অনুমোদিত অ্যাকাউন্ট ছাড়া প্রবেশ নিষিদ্ধ · {staff.role}
      </footer>
    </div>
  );
}
