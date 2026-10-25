import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const staff = await requireStaff(["supreme", "admin", "staff"]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            NEWEIX · ADMIN
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Admin Dashboard
          </h1>

          <p className="mt-2 text-gray-600">
            লগইন করা Role: {staff.role}
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-xl font-semibold">
            ব্যবস্থাপনা
          </h2>

          <p className="mt-2 text-gray-600">
            আপনার অনুমতি অনুযায়ী ব্যবস্থাপনার অপশন নির্বাচন করুন।
          </p>

          <a
            href="/admin/products"
            className="mt-5 inline-block rounded-lg bg-blue-700 px-5 py-3 font-medium text-white"
          >
            পণ্য ও স্টক ব্যবস্থাপনা →
          </a>
        </section>
      </div>
    </main>
  );
}