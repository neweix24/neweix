import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

const baseLinks = [
  { href: "/admin/products", label: "পণ্য ও স্টক", description: "পণ্যের তথ্য ও মজুত দেখুন", icon: "▦" },
  { href: "/admin/inventory", label: "ইনভেন্টরি", description: "স্টকের অবস্থা পরিচালনা করুন", icon: "▤" },
  { href: "/admin/categories", label: "ক্যাটাগরি", description: "পণ্যের বিভাগ সাজান", icon: "◫" },
  { href: "/admin/submissions", label: "পণ্য প্রস্তাব", description: "নতুন পণ্যের প্রস্তাব পর্যালোচনা করুন", icon: "＋" },
  { href: "/admin/orders", label: "অর্ডার ও পেমেন্ট", description: "অর্ডার এবং পেমেন্টের অবস্থা দেখুন", icon: "▣" },
];

export default async function AdminPage() {
  const staff = await requireStaff(["supreme", "admin", "staff"]);
  const links = staff.role === "staff"
    ? [baseLinks[0]]
    : [
        ...baseLinks,
        ...(staff.role === "supreme" ? [
          { href: "/admin/customers", label: "কাস্টমার CRM", description: "কাস্টমার সম্পর্ক ব্যবস্থাপনা", icon: "◎" },
          { href: "/admin/customer-data-requests", label: "কাস্টমার ডেটা অনুরোধ", description: "ডেটা ও গোপনীয়তার অনুরোধ", icon: "⌁" },
        ] : []),
      ];

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="relative overflow-hidden rounded-3xl border p-6 sm:p-9" style={{
          borderColor: "var(--border)",
          background: "radial-gradient(ellipse at 90% 0%, rgba(196,243,107,.14), transparent 42%), linear-gradient(135deg, #17251a, #0e1510 72%)",
        }}>
          <p className="neweix-kicker">NEWEIX · ADMIN WORKSPACE</p>
          <h1 className="neweix-page-title mt-3">অ্যাডমিন ড্যাশবোর্ড</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            লগইন করা Role: <strong style={{ color: "var(--primary)" }}>{staff.role}</strong>
          </p>
        </header>

        <section className="mt-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="neweix-kicker">WORKSPACE</p>
              <h2 className="mt-1 text-xl font-extrabold">ব্যবস্থাপনা</h2>
            </div>
            <Link href="/" className="neweix-button-secondary text-sm">স্টোরফ্রন্ট দেখুন ↗</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((item) => (
              <Link key={item.href} href={item.href}
                className="group rounded-2xl border p-5 transition duration-200 hover:-translate-y-1 sm:p-6"
                style={{ borderColor: "var(--border)", background: "linear-gradient(145deg, var(--surface-raised), var(--surface))" }}>
                <span className="grid h-11 w-11 place-items-center rounded-xl text-xl font-bold" style={{ background: "var(--brand-lime-soft)", color: "var(--primary)" }}>{item.icon}</span>
                <h3 className="mt-5 text-lg font-extrabold">{item.label} <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span></h3>
                <p className="mt-2 text-sm leading-7" style={{ color: "var(--muted)" }}>{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
