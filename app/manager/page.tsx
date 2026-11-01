import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ManagerPage() {
  const staff = await requireStaff(["manager"]);
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border p-6">
          <p className="eyebrow">NEWEIX · MANAGER WORKSPACE</p>
          <h1 className="text-3xl font-bold">Manager Dashboard</h1>
          <p>Signed in as Manager · {staff.user.email}</p>
        </header>
        <section className="rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Responsibilities</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Review assigned department tasks and report progress.</li>
            <li>Review department attendance and submit reports.</li>
            <li>Coordinate employees within assigned responsibilities.</li>
            <li>View finance information only where access is explicitly granted.</li>
          </ul>
          <p className="mt-4 text-sm">Department-level data scoping and task/attendance workflows are not yet activated. This workspace is a role-gated foundation, not a claim that those modules are complete.</p>
        </section>
        <Link href="/" className="underline">Return to storefront</Link>
      </div>
    </main>
  );
}
