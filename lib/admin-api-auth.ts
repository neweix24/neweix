import { getCurrentStaff } from "@/lib/auth";

export async function getAdminApiActor() {
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false as const, status: 401 as const, error: "লগইন প্রয়োজন।" };
  }
  if (staff.mfaRequired) {
    return { ok: false as const, status: 403 as const, error: "Supreme অ্যাকাউন্টে MFA সম্পন্ন করুন।" };
  }
  if (staff.role !== "supreme" && staff.role !== "admin") {
    return { ok: false as const, status: 403 as const, error: "এই তথ্য দেখার অনুমতি নেই।" };
  }
  return { ok: true as const, user: staff.user, role: staff.role };
}
