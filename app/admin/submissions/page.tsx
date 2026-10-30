import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import ProductSubmissionsManager from "@/features/admin/product-submissions-manager";
export const dynamic = "force-dynamic";
export default async function ProductSubmissionsPage() {
  const staff = await requireStaff(["supreme", "admin"]);
  return <main className="min-h-screen px-4 py-10 sm:px-6" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-5xl"><header className="mb-8"><p className="eyebrow">NEWEIX · PRODUCT WORKFLOW</p><h1 className="mt-2 text-3xl font-bold">পণ্য প্রস্তাব ও অনুমোদন</h1><p className="mt-2">লগইন করা Role: <strong style={{color:"var(--primary)"}}>{staff.role}</strong></p><Link href="/admin" className="mt-4 inline-flex text-sm font-semibold underline" style={{color:"var(--primary)"}}>← Admin Dashboard</Link></header><ProductSubmissionsManager role={staff.role}/></div></main>;
}