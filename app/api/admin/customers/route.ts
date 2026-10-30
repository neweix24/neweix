import { NextResponse } from "next/server";
import { getAdminApiActor } from "@/lib/admin-api-auth";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getAdminApiActor();
  if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status });

  try {
    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin
      .from("customer_profiles")
      .select("user_id,full_name,display_name,phone,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Customer CRM query failed:", error.message);
      return NextResponse.json({ error: "কাস্টমার তালিকা লোড করা যায়নি।" }, { status: 500 });
    }

    return NextResponse.json({ customers: data ?? [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Customer CRM request failed:", error);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}
