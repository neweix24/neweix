import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import SocialMediaPublisher from "@/features/admin/social-media-publisher";

export const dynamic = "force-dynamic";

export default async function AdminSocialMediaPage() {
  const staff = await requireStaff(["supreme", "admin"]);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · SOCIAL PUBLISHER</p>
          <h1 className="mt-2 text-3xl font-bold">সোশ্যাল মিডিয়া অটোমেশন</h1>
          <p className="mt-2">Facebook, Instagram, TikTok ও YouTube-এর পোস্ট এক জায়গা থেকে পরিচালনা করুন।</p>
          <p className="mt-1 text-sm">লগইন করা Role: <strong>{staff.role}</strong></p>
          <Link href="/admin" className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4">← অ্যাডমিন ড্যাশবোর্ড</Link>
        </header>
        <SocialMediaPublisher />
      </div>
    </main>
  );
}
