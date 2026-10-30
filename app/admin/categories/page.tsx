import Link from "next/link";
import { requireStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function AdminCategoriesPage() {
 const staff=await requireStaff(["supreme","admin","staff"]);
 return <main className="min-h-screen px-4 py-10 sm:px-6" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-5xl">
 <header className="mb-8"><p className="eyebrow">NEWEIX · ADMIN</p><h1 className="mt-2 text-3xl font-bold">ক্যাটাগরি ব্যবস্থাপনা</h1><p className="mt-2">লগইন করা Role: <strong style={{color:"var(--primary)"}}>{staff.role}</strong></p><Link href="/admin" className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4" style={{color:"var(--primary)"}}>← Admin Dashboard-এ ফিরে যান</Link></header>
 <section className="rounded-2xl border p-5 sm:p-7" style={{borderColor:"var(--border)",background:"var(--surface)"}}><h2 className="text-xl font-bold">ক্যাটাগরি API সংযোগ প্রয়োজন</h2><p className="mt-3 leading-7" style={{color:"var(--muted)"}}>ডেটাবেসে categories টেবিল ও সক্রিয় ক্যাটাগরি পড়ার RLS policy রয়েছে। কিন্তু বর্তমান branch-এ ক্যাটাগরি তালিকা/তৈরি/সম্পাদনার কোনো API route পাওয়া যায়নি। তাই ভুল বা অকার্যকর CRUD ফর্ম দেখানো হচ্ছে না।</p>
 <div className="mt-5 rounded-xl border p-4" style={{borderColor:"var(--border)",background:"var(--bg)"}}><p className="font-semibold">পরবর্তী প্রয়োজনীয় backend কাজ</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{color:"var(--muted)"}}><li>ক্যাটাগরি তালিকা, তৈরি, সম্পাদনা ও নিষ্ক্রিয় করার নিরাপদ API</li><li>শুধু Supreme/Admin-এর write permission; Staff-এর read-only access</li><li>Slug uniqueness, input validation ও audit log</li><li>পণ্য তৈরির ফর্মে ক্যাটাগরি নির্বাচন</li></ul></div>
 <p className="mt-4 text-sm">এখনকার জন্য <Link href="/admin/inventory" className="font-semibold underline" style={{color:"var(--primary)"}}>ইনভেন্টরি মডিউল</Link> ব্যবহার করুন।</p></section></div></main>;
}