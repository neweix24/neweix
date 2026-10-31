import { NextResponse } from "next/server";
import { getSupremeApiActor } from "@/lib/admin-api-auth";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getSupremeApiActor();
  if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status });

  try {
    const admin = await createRuntimeServiceClient();
    const { data, error } = await admin
      .from("customer_profiles")
      .select("user_id,full_name,display_name,email,avatar_url,date_of_birth,phone,phone_verified_at,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Customer CRM query failed:", error.message);
      return NextResponse.json({ error: "কাস্টমার তালিকা লোড করা যায়নি।" }, { status: 500 });
    }

    const ids = (data ?? []).map((profile) => profile.user_id);
    const { data: orders, error: orderError } = ids.length
      ? await admin.from("orders").select("customer_id,total,created_at,status").in("customer_id", ids).order("created_at", { ascending: false }).limit(3000)
      : { data: [], error: null };

    if (orderError) {
      console.error("Customer order summary failed:", orderError.message);
      return NextResponse.json({ error: "অর্ডার সারাংশ লোড করা যায়নি।" }, { status: 500 });
    }

    const summary = new Map<string, { count: number; total: number; lastOrder: string | null; lastStatus: string | null }>();
    for (const order of orders ?? []) {
      if (!order.customer_id) continue;
      const current = summary.get(order.customer_id) ?? { count: 0, total: 0, lastOrder: null, lastStatus: null };
      current.count += 1;
      current.total += Number(order.total) || 0;
      if (!current.lastOrder || order.created_at > current.lastOrder) {
        current.lastOrder = order.created_at;
        current.lastStatus = order.status;
      }
      summary.set(order.customer_id, current);
    }

    const customers = (data ?? []).map((profile) => ({
      ...profile,
      order_summary: summary.get(profile.user_id) ?? { count: 0, total: 0, lastOrder: null, lastStatus: null },
    }));

    return NextResponse.json({ customers }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Customer CRM request failed:", error);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}
