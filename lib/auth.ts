import { createServerSupabaseClient } from "./supabase/server";

export async function getCurrentUser() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user;
}