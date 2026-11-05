import NeweixPlus from "@/features/eixpay/neweix-plus";

export const dynamic = "force-dynamic";

// Customer authentication and verified-phone enforcement are centralized in
// middleware. Avoid a second server-component Auth lookup that can race with
// Supabase refresh-token rotation during App Router navigation.
export default function NeweixPlusPage() {
  return <NeweixPlus />;
}
