import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import WorkforceDashboard from "@/components/workforce/WorkforceDashboard";

export const dynamic = "force-dynamic";

export default async function EmployeePage() {
  const staff = await requireStaff(["employee"]);
  return (
    <main className="premium-workforce-workspace min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border p-6">
          <p className="eyebrow">NEWEIX · EMPLOYEE WORKSPACE</p>
          <h1 className="text-3xl font-bold">Employee Dashboard</h1>
          <p>Signed in as Employee · {staff.user.email}</p>
        </header>
        <WorkforceDashboard role="employee" />
        <Link href="/" className="underline">Return to storefront</Link>
      </div>
    </main>
  );
}
