import { requireStaff } from "@/lib/auth";
import StaffCreateForm from "./StaffCreateForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SupremeStaffPage() {
  await requireStaff(["supreme"]);

  return (
    <main className="hero auth-page">
      <p className="eyebrow">NEWEIX · SUPREME PANEL</p>

      <h1>Admin & Staff Management</h1>

      <p className="hero-copy">
        এখানে নতুন Admin অথবা Staff অ্যাকাউন্ট তৈরি করুন।
      </p>

      <section>
        <h2>নতুন অ্যাকাউন্ট তৈরি</h2>

        <StaffCreateForm />
      </section>

      <p>
        <Link href="/supreme">
          ← Supreme Dashboard-এ ফিরে যান
        </Link>
      </p>
    </main>
  );
}