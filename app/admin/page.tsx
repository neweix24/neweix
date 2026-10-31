import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import Icon from "@/components/ui/icon";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
 const staff=await requireStaff(["supreme","admin","staff"]);
 const linkClass="inline-flex min-h-11 items-center rounded-xl border px-5 py-3 font-semibold";
 const linkStyle={borderColor:"var(--border)",color:"var(--ink)"};
 return <main className="min-h-screen px-4 py-10 sm:px-6" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-6xl">
 <header className="mb-8"><p className="eyebrow">NEWEIX · ADMIN WORKSPACE</p><h1 className="mt-2 text-3xl font-bold">অ্যাডমিন ড্যাশবোর্ড</h1><p className="mt-2">লগইন করা Role: <strong style={{color:"var(--primary)"}}>{staff.role}</strong></p></header>
 <section className="rounded-2xl border p-5 sm:p-7" style={{borderColor:"var(--border)",background:"var(--surface)"}}><h2 className="text-xl font-semibold">ব্যবস্থাপনা</h2><p className="mt-2">আপনার অনুমতি অনুযায়ী ব্যবস্থাপনার অপশন নির্বাচন করুন।</p>
 <div className="mt-5 flex flex-wrap gap-3"><Link href="/admin/products" className="inline-flex min-h-11 items-center rounded-xl px-5 py-3 font-semibold" style={{background:"var(--primary)",color:"#10170d"}}><Icon name="package" size={17} /> পণ্য ও স্টক দেখুন <Icon name="arrow-right" size={16} /></Link>{staff.role!=="staff"&&<><Link href="/admin/inventory" className={linkClass} style={linkStyle}><Icon name="grid" size={17} /> ইনভেন্টরি <Icon name="arrow-right" size={16} /></Link><Link href="/admin/categories" className={linkClass} style={linkStyle}><Icon name="tag" size={17} /> ক্যাটাগরি <Icon name="arrow-right" size={16} /></Link><Link href="/admin/submissions" className={linkClass} style={linkStyle}><Icon name="gift" size={17} /> পণ্য প্রস্তাব <Icon name="arrow-right" size={16} /></Link><Link href="/admin/orders" className={linkClass} style={linkStyle}><Icon name="orders" size={17} /> অর্ডার ও পেমেন্ট <Icon name="arrow-right" size={16} /></Link>{staff.role==="supreme"&&<><Link href="/admin/customers" className={linkClass} style={linkStyle}><Icon name="user" size={17} /> কাস্টমার CRM <Icon name="arrow-right" size={16} /></Link><Link href="/admin/customer-data-requests" className={linkClass} style={linkStyle}><Icon name="shield" size={17} /> কাস্টমার ডেটা অনুরোধ <Icon name="arrow-right" size={16} /></Link></> }</>}<Link href="/" className={linkClass} style={linkStyle}><Icon name="globe" size={17} /> স্টোরফ্রন্ট দেখুন</Link></div>
 </section></div></main>;
}