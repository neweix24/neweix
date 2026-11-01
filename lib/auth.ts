import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/permissions";

const ACTIVE_STAFF_ROLES: readonly StaffRole[] = [
  "supreme", "admin", "manager", "employee", "staff",
];

export async function getCurrentStaff() {
  const supabase = await createServerSupabaseClient();

  // Verify the signed JWT locally instead of calling /auth/v1/user on
  // every server render. This avoids competing refresh-token rotations
  // between middleware, Server Components and the browser client.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = claims?.sub;

  if (claimsError || typeof userId !== "string" || !userId) {
    return null;
  }

  const user = {
    ...claims,
    id: userId,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.is_active !== true ||
    !ACTIVE_STAFF_ROLES.includes(profile.role as StaffRole)
  ) {
    return null;
  }

  // Supreme must complete MFA before accessing protected pages.
  if (profile.role === "supreme") {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (assuranceError || assurance.currentLevel !== "aal2") {
      return {
        user,
        role: profile.role as StaffRole,
        mfaRequired: true,
      };
    }
  }

  return {
    user,
    role: profile.role as StaffRole,
    mfaRequired: false,
  };
}

export async function requireStaff(allowedRoles: StaffRole[]) {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect("/auth/login?next=/admin");
  }

  if (staff.mfaRequired) {
    redirect("/auth/mfa");
  }

  if (!allowedRoles.includes(staff.role)) {
    redirect("/unauthorized");
  }

  return staff;
}
