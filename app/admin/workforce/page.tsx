import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import AdminWorkforceManager from "./AdminWorkforceManager";

export const dynamic = "force-dynamic";

export default async function AdminWorkforcePage() {
  await requireStaff(["admin"]);
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border p-6">
          <p className="eyebrow">NEWEIX · ADMIN WORKSPACE</p>
          <h1 className="text-3xl font-bold">Department Management</h1>
          <p className="mt-2 opacity-75">Create departments, assign approved Managers and place Employees into departments.</p>
        </header>
        <AdminWorkforceManager />
        <Link href="/admin" className="underline">← Back to Admin Dashboard</Link>
      </div>
    </main>
  );
}
