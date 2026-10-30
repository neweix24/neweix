import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SupremeAuditLogsPage() {
  const staff = await requireStaff(["supreme"]);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="eyebrow">NEWEIX · SUPREME CONTROL</p>
          <h1 className="mt-2 text-3xl font-bold">অডিট লগ</h1>
          <p className="mt-2">লগইন করা Role: <strong>{staff.role}</strong></p>
          <Link href="/supreme" className="mt-4 inline-flex text-sm font-semibold underline" style={{ color: "var(--primary)" }}>
            ← Supreme Dashboard
          </Link>
        </header>

        <section className="rounded-2xl border p-5 sm:p-7" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="font-semibold">Audit Log viewer এখনও backend integration-এর অপেক্ষায়।</p>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            এই branch-এ অডিট লগ পড়ার জন্য কোনো অনুমোদিত API route পাওয়া যায়নি। তাই এখানে কোনো নমুনা বা কল্পিত লগ দেখানো হচ্ছে না।
          </p>
          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <strong>যাচাই করা অবস্থা</strong>
              <p className="mt-1">audit_logs টেবিলের প্রাথমিক schema-তে actor_user_id রয়েছে। একটি পরবর্তী order-status migration actor_id লিখতে চায়—দুটি নামের অসামঞ্জস্য রয়েছে।</p>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <strong>পরবর্তী backend কাজ</strong>
              <p className="mt-1">Supreme MFA ও role যাচাইসহ read-only, paginated audit API; actor/action/target/date filter; এবং migration column consistency পরীক্ষা।</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
