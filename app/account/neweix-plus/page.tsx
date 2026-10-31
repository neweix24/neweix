import { redirect } from "next/navigation";
import NeweixPlus from "@/features/eixpay/neweix-plus";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function NeweixPlusPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth/customer-login?next=/account/neweix-plus");
  return <NeweixPlus />;
}
