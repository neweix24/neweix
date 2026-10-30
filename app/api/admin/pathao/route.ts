import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPathaoCities, getPathaoConfig, getPathaoStores } from "@/lib/pathao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizeAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "লগইন প্রয়োজন।", status: 401 as const };
  }

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true ||
      !["supreme", "admin"].includes(profile.role)) {
    return { error: "এই কাজের অনুমতি নেই।", status: 403 as const };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance.currentLevel !== "aal2") {
      return { error: "Supreme অ্যাকাউন্টে MFA সম্পন্ন করুন।", status: 403 as const };
    }
  }

  return { user, role: profile.role };
}

export async function GET(request: Request) {
  const staff = await authorizeAdmin();
  if ("error" in staff) {
    return NextResponse.json({ error: staff.error }, { status: staff.status });
  }

  const action = new URL(request.url).searchParams.get("action") || "status";

  try {
    const config = await getPathaoConfig();

    if (action === "status") {
      return NextResponse.json({
        configured: true,
        environment: config.baseUrl.includes("sandbox") ? "sandbox" : "production",
        message: "Pathao credentials পাওয়া গেছে।",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "stores") {
      const stores = await getPathaoStores();
      return NextResponse.json({ success: true, stores }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (action === "cities") {
      const cities = await getPathaoCities();
      return NextResponse.json({ success: true, cities }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({ error: "অজানা Pathao action।" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pathao সংযোগ ব্যর্থ।";
    console.error("Pathao admin API failed:", message);
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
