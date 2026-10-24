import { requireStaff } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SupremeStaffPage() {
  await requireStaff(["supreme"]);

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · SUPREME PANEL</p>

      <h1>Admin & Staff Management</h1>

      <p className="hero-copy">
        এখানে Supreme অ্যাকাউন্ট থেকে Admin ও Staff
        অ্যাকাউন্ট পরিচালনা করা যাবে।
      </p>

      <section>
        <h2>নতুন অ্যাকাউন্ট তৈরি</h2>

        <p className="hero-copy">
          নিরাপদভাবে অ্যাকাউন্ট তৈরির API যুক্ত করার পর
          এই সুবিধাটি চালু হবে।
        </p>
      </section>

      <p>
        <Link href="/supreme">
          ← Supreme Dashboard-এ ফিরে যাও
        </Link>
      </p>
    </main>
  );
}