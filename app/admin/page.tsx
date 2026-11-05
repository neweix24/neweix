import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import Icon from "@/components/ui/icon";

export const dynamic = "force-dynamic";

const cardClass = "group flex min-h-40 flex-col justify-between rounded-2xl border p-5 transition duration-200 hover:-translate-y-1";
const cardStyle = { borderColor: "#e0eae0", background: "rgba(255,255,255,.96)", boxShadow: "0 10px 28px rgba(45,110,65,.05)" };

export default async function AdminPage() {
  const staff = await requireStaff(["supreme", "admin", "staff"]);
  const canManage = staff.role !== "staff";

  return (
    <main className="min-h-screen px-4 py-9 sm:px-6" style={{ background: "radial-gradient(ellipse at 85% 0%,rgba(182,255,74,.13),transparent 38%),linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 rounded-3xl border p-7 sm:p-10" style={{ borderColor: "#dfeade", background: "radial-gradient(ellipse at 100% 0%,rgba(182,255,74,.18),transparent 45%),linear-gradient(135deg,#fff,#f5ffef)", boxShadow: "0 14px 38px rgba(45,110,65,.07)" }}>
          <div>
            <p className="text-xs font-black tracking-[.2em]" style={{ color: "#368c61" }}>NEWEIX · ADMIN WORKSPACE</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Admin Dashboard</h1>
            <p className="mt-2 max-w-xl" style={{ color: "var(--muted)" }}>A clear workspace for day-to-day store operations and inventory oversight.</p>
          </div>
          <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "#d9e8d6", background: "#fff" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>Signed-in role</p>
            <p className="mt-1 text-lg font-black capitalize" style={{ color: "#28764b" }}>{staff.role}</p>
          </div>
        </header>

        <div className="mb-5 flex items-center justify-between gap-3">
          <div><p className="text-xs font-black tracking-[.16em]" style={{ color: "#368c61" }}>WORKSPACE</p><h2 className="mt-1 text-xl font-black">Management tools</h2></div>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#dfeade", background: "#fff", color: "#285c3b" }}><Icon name="globe" size={16} /> View storefront</Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Management tools">
          <Link href="/admin/products" className={cardClass} style={cardStyle}>
            <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="package" size={21} /></span>
            <span><strong className="block text-lg font-black">Products & Stock</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>View product details and current stock levels.</span></span>
            <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
          </Link>

          {canManage && <>
            <Link href="/admin/inventory" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="grid" size={21} /></span>
              <span><strong className="block text-lg font-black">Inventory</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Review stock levels and inventory health.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
            <Link href="/admin/categories" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="tag" size={21} /></span>
              <span><strong className="block text-lg font-black">Categories</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Organize the store catalogue.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
            <Link href="/admin/submissions" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="gift" size={21} /></span>
              <span><strong className="block text-lg font-black">Product Submissions</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Review incoming product submissions.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
            <Link href="/admin/orders" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="orders" size={21} /></span>
              <span><strong className="block text-lg font-black">Orders & Payments</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Manage customer orders and payment status.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
            <Link href="/admin/integrations" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="settings" size={21} /></span>
              <span><strong className="block text-lg font-black">Integrations</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Check Pathao Courier and BulkSMSBD connections.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
            <Link href="/admin/workforce" aria-label="Manage NEWEIX departments, managers and employee assignments" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="user" size={21} /></span>
              <span><strong className="block text-lg font-black">Departments & Teams</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Create departments and assign Managers and Employees.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
            <Link href="/admin/staff" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="user" size={21} /></span>
              <span><strong className="block text-lg font-black">Workforce Management</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Create Employees and propose Manager appointments.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
            <Link href="/admin/social-media" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="globe" size={21} /></span>
              <span><strong className="block text-lg font-black">Social Media Automation</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Manage connected social publishing tools.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
          </>}

          {staff.role === "supreme" && <>
            <Link href="/admin/customers" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="user" size={21} /></span>
              <span><strong className="block text-lg font-black">Customer CRM</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Review customer account records.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
            <Link href="/admin/customer-data-requests" className={cardClass} style={cardStyle}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eff9e9", color: "#28764b" }}><Icon name="shield" size={21} /></span>
              <span><strong className="block text-lg font-black">Customer Data Requests</strong><span className="mt-1 block text-sm" style={{ color: "var(--muted)" }}>Handle privacy and data access requests.</span></span>
              <span className="text-xs font-extrabold" style={{ color: "#28764b" }}>Open workspace →</span>
            </Link>
          </>}
        </section>

        <p className="mt-6 rounded-2xl border p-4 text-sm leading-6" style={{ borderColor: "#dfeade", background: "rgba(255,255,255,.8)", color: "var(--muted)" }}>
          {staff.role === "staff" ? "Staff access is limited to viewing products and stock. Product editing, order management, customer records and administrative settings remain restricted." : "Available tools are controlled by your assigned role and server-side permissions."}
        </p>
      </div>
    </main>
  );
}
