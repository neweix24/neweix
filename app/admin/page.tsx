import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const staff = await requireStaff(["supreme", "admin", "staff"]);

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · STAFF PANEL</p>
      <h1>Admin Dashboard</h1>

      <p className="hero-copy">
        আপনার অ্যাকাউন্ট যাচাই করা হয়েছে।
      </p>

      <p className="hero-copy">
        বর্তমান Role: <strong>{staff.role}</strong>
      </p>

      <p className="hero-copy">
        এখানে শুধু অনুমোদিত স্টাফ অ্যাকাউন্ট প্রবেশ করতে পারবে।
      </p>

      {staff.role === "supreme" && (
        <p className="hero-copy">
          Supreme অ্যাকাউন্টের জন্য দুই ধাপের যাচাইকরণ বাধ্যতামূলক।
        </p>
      )}
    </main>
  );
}