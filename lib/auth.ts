import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StaffRole = "supreme" | "admin" | "staff";

export async function getCurrentStaff() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.is_active !== true ||
    !["supreme", "admin", "staff"].includes(profile.role)
  ) {
    return null;
  }

  // Supreme must complete MFA before accessing protected pages.
  if (profile.role === "supreme") {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      assuranceError ||
      assurance.currentLevel !== "aal2"
    ) {
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

export async function requireStaff(
  allowedRoles: StaffRole[]
) {
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