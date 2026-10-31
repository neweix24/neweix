import { redirect } from "next/navigation";
import EixVerseHub from "@/features/eixverse/eixverse-hub";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function EixVersePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth/customer-login?next=/eixverse");
  return <EixVerseHub />;
}
