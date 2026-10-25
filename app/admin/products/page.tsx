import { requireStaff } from "@/lib/auth";
import ProductsManager from "./ProductsManager";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const staff = await requireStaff(["supreme", "admin", "staff"]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            NEWEIX · ADMIN
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            পণ্য ও স্টক ব্যবস্থাপনা
          </h1>

          <p className="mt-2 text-gray-600">
            লগইন করা Role: {staff.role}
          </p>

          <a
            href="/admin"
            className="mt-4 inline-block text-blue-700 underline"
          >
            ← Admin Dashboard-এ ফিরে যান
          </a>
        </header>

        <ProductsManager role={staff.role} />
      </div>
    </main>
  );
}