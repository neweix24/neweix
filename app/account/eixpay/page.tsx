import { redirect } from "next/navigation";
import EixPayWallet from "@/features/eixpay/eixpay-wallet";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function EixPayPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth/customer-login?next=/account/eixpay");
  return <EixPayWallet />;
}
