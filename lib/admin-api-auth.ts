import { getCurrentStaff } from "@/lib/auth";

export async function getSupremeApiActor() {
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false as const, status: 401 as const, error: "লগইন প্রয়োজন।" };
  }
  if (staff.role !== "supreme") {
    return { ok: false as const, status: 403 as const, error: "এই সংবেদনশীল তথ্য শুধু Supreme দেখতে পারবেন।" };
  }
  if (staff.mfaRequired) {
    return { ok: false as const, status: 403 as const, error: "Supreme অ্যাকাউন্টে MFA সম্পন্ন করুন।" };
  }
  return { ok: true as const, user: staff.user, role: staff.role };
}
