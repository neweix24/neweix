import { requireStaff } from "@/lib/auth";
import StaffCreateForm from "./StaffCreateForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SupremeStaffPage() {
  await requireStaff(["supreme"]);

  return (
    <main className="hero auth-page">
      <p className="eyebrow">NEWEIX · SUPREME PANEL</p>

      <h1>Admin & Staff Management</h1>

      <p className="hero-copy">
        Create Admin, Manager and Employee accounts. Manager nominations from Admin must be reviewed before provisioning.
      </p>

      <section>
        <h2>Create New Account</h2>

        <StaffCreateForm />
      </section>

      <p>
        <Link href="/supreme">
          ← Back to Supreme Dashboard
        </Link>
      </p>
    </main>
  );
}