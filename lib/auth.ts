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

  return {
    user,
    role: profile.role as StaffRole,
  };
}

export async function requireStaff(
  allowedRoles: StaffRole[]
) {
  const staff = await getCurrentStaff();

  if (!staff) {
    redirect("/auth/login?next=/admin");
  }

  if (!allowedRoles.includes(staff.role)) {
    redirect("/unauthorized");
  }

  return staff;
}