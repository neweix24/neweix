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
    const [addressesResult, ordersResult] = await Promise.all([
      ids.length
        ? admin.from("customer_addresses").select("user_id,label,recipient_name,phone,address_line,area,upazila,district,division,postal_code,is_default").in("user_id", ids).order("is_default", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? (async () => {
            const allOrders: Array<{ customer_id: string | null; total: number | string | null; created_at: string; status: string }> = [];
            const pageSize = 1000;
            for (let from = 0; ; from += pageSize) {
              const { data: page, error } = await admin
                .from("orders")
                .select("customer_id,total,created_at,status")
                .in("customer_id", ids)
                .order("created_at", { ascending: false })
                .range(from, from + pageSize - 1);
              if (error) return { data: null, error };
              allOrders.push(...(page ?? []));
              if (!page || page.length < pageSize) break;
            }
            return { data: allOrders, error: null };
          })()
        : Promise.resolve({ data: [], error: null }),
    ]);
    const { data: orders, error: orderError } = ordersResult;
    const { data: addresses, error: addressError } = addressesResult;

    if (addressError) {
      console.error("Customer addresses query failed:", addressError.message);
      return NextResponse.json({ error: "কাস্টমারের ঠিকানা লোড করা যায়নি।" }, { status: 500 });
    }

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

    const addressMap = new Map<string, typeof addresses>();
    for (const address of addresses ?? []) {
      const current = addressMap.get(address.user_id) ?? [];
      current.push(address);
      addressMap.set(address.user_id, current);
    }

    const customers = (data ?? []).map((profile) => ({
      ...profile,
      addresses: addressMap.get(profile.user_id) ?? [],
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
