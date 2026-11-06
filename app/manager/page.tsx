import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import WorkforceDashboard from "@/components/workforce/WorkforceDashboard";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const staff = await requireStaff(["manager"]);
  return (
    <main className="premium-workforce-workspace min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border p-6">
          <p className="eyebrow">NEWEIX · MANAGER WORKSPACE</p>
          <h1 className="text-3xl font-bold">Manager Dashboard</h1>
          <p>Signed in as Manager · {staff.user.email}</p>
        </header>
        <WorkforceDashboard role="manager" />
        <Link href="/" className="underline">Return to storefront</Link>
      </div>
    </main>
  );
}
