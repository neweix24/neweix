import { getCurrentStaff } from "@/lib/auth";

export async function getSupremeApiActor() {
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false as const, status: 401 as const, error: "Authentication is required." };
  }
  if (staff.role !== "supreme") {
    return { ok: false as const, status: 403 as const, error: "Only an authorized Supreme account can access this sensitive information." };
  }
  if (staff.mfaRequired) {
    return { ok: false as const, status: 403 as const, error: "Complete MFA verification for your Supreme account." };
  }
  return { ok: true as const, user: staff.user, role: staff.role };
}
