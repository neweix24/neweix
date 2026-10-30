import { requireStaff } from "@/lib/auth";
import OrdersManager from "@/features/admin/orders-manager";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const staff = await requireStaff(["supreme", "admin"]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            NEWEIX · ADMIN
          </p>
          <h1 className="mt-2 text-3xl font-bold">অর্ডার ও পেমেন্ট</h1>
          <p className="mt-2 text-gray-600">
            লগইন করা Role: {staff.role}
          </p>
          <a className="mt-4 inline-block text-blue-700 underline" href="/admin">
            ← অ্যাডমিন ড্যাশবোর্ড
          </a>
        </header>

        <OrdersManager />
      </div>
    </main>
  );
}
