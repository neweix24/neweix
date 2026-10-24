import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SupremePage() {
  const staff = await requireStaff(["supreme"]);

  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · SUPREME PANEL</p>
      <h1>Supreme Dashboard</h1>

      <p className="hero-copy">
        আপনার পরিচয় ও দুই ধাপের যাচাইকরণ সার্ভার থেকে যাচাই করা হয়েছে।
      </p>

      <p className="hero-copy">
        Role: <strong>{staff.role}</strong>
      </p>

      <p className="hero-copy">
        নিরাপত্তার কারণে এই পেজে প্রবেশের জন্য Supreme অনুমতি এবং
        প্রয়োজনীয় MFA যাচাইকরণ বাধ্যতামূলক।
      </p>
    </main>
  );
}