import { requireStaff } from "@/lib/auth";
import SupremeDashboard from "@/features/supreme/supreme-dashboard";

export const dynamic = "force-dynamic";

export default async function SupremePage() {
  const staff = await requireStaff(["supreme"]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-4 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
              NEWEIX · SUPREME PANEL
            </p>

            <p className="mt-1 text-sm text-gray-600">
              লগইন করা Role: {staff.role}
            </p>
          </div>

          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-800"
            >
              লগআউট
            </button>
          </form>
        </div>
      </header>

      <SupremeDashboard />
    </div>
  );
}