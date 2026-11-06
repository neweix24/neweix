import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import SupremeNotificationInbox from "@/features/supreme/supreme-notification-inbox";

export const dynamic = "force-dynamic";

export default async function SupremeNotificationsPage() {
  await requireStaff(["supreme"]);

  return (
    <main className="premium-supreme-page min-h-screen px-4 py-8 sm:px-6 sm:py-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="eyebrow">NEWEIX · SUPREME CONTROL</p>
          <h1 className="mt-2 text-3xl font-black">Notification Inbox</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>শুধু Supreme-এর জন্য ব্যবসার গুরুত্বপূর্ণ সতর্কতা ও কার্যক্রম।</p>
          <Link href="/supreme" className="mt-4 inline-flex text-sm font-semibold underline" style={{ color: "var(--primary)" }}>← Supreme Dashboard</Link>
        </header>
        <SupremeNotificationInbox />
      </div>
    </main>
  );
}
