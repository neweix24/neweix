import { NextRequest, NextResponse } from "next/server";
import { getSupremeApiActor } from "@/lib/admin-api-auth";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const MAX_SEARCH_LENGTH = 80;

type CustomerAddress = {
  user_id: string;
  label: string | null;
  recipient_name: string | null;
  phone: string | null;
  address_line: string | null;
  area: string | null;
  upazila: string | null;
  district: string | null;
  division: string | null;
  postal_code: string | null;
  is_default: boolean;
};

export async function GET(request: NextRequest) {
  const actor = await getSupremeApiActor();
  if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const rawPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
  const search = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
  const safeSearch = search.replace(/[,%()\\]/g, " ").replace(/\s+/g, " ").trim();

  try {
    const admin = await createRuntimeServiceClient();
    let profileQuery = admin
      .from("customer_profiles")
      .select("user_id,full_name,display_name,email,avatar_url,date_of_birth,phone,phone_verified_at,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("user_id", { ascending: true });

    if (safeSearch) {
      const pattern = `%${safeSearch}%`;
      profileQuery = profileQuery.or([
        `full_name.ilike.${pattern}`,
        `display_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
      ].join(","));
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data, error, count } = await profileQuery.range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Customer CRM query failed:", error.message);
      return NextResponse.json({ error: "কাস্টমার তালিকা লোড করা যায়নি।" }, { status: 500 });
    }

    const ids = (data ?? []).map((profile) => profile.user_id);
    const [addressesResult, ordersResult] = await Promise.all([
      ids.length
        ? admin.from("customer_addresses")
            .select("user_id,label,recipient_name,phone,address_line,area,upazila,district,division,postal_code,is_default")
            .in("user_id", ids)
            .order("is_default", { ascending: false })
        : Promise.resolve({ data: [] as CustomerAddress[], error: null }),
      ids.length
        ? (async () => {
            const allOrders: Array<{ customer_id: string | null; total: number | string | null; created_at: string; status: string }> = [];
            const pageSize = 1000;
            for (let offset = 0; ; offset += pageSize) {
              const { data: rows, error: orderQueryError } = await admin
                .from("orders")
                .select("customer_id,total,created_at,status")
                .in("customer_id", ids)
                .not("status", "in", "(cancelled,returned)")
                .order("created_at", { ascending: false })
                .range(offset, offset + pageSize - 1);
              if (orderQueryError) return { data: null, error: orderQueryError };
              allOrders.push(...(rows ?? []));
              if (!rows || rows.length < pageSize) break;
            }
            return { data: allOrders, error: null };
          })()
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (addressesResult.error) {
      console.error("Customer addresses query failed:", addressesResult.error.message);
      return NextResponse.json({ error: "কাস্টমারের ঠিকানা লোড করা যায়নি।" }, { status: 500 });
    }
    if (ordersResult.error) {
      console.error("Customer order summary failed:", ordersResult.error.message);
      return NextResponse.json({ error: "অর্ডার সারাংশ লোড করা যায়নি।" }, { status: 500 });
    }

    const summary = new Map<string, { count: number; total: number; lastOrder: string | null; lastStatus: string | null }>();
    for (const order of ordersResult.data ?? []) {
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

    const addressMap = new Map<string, NonNullable<typeof addressesResult.data>>();
    for (const address of addressesResult.data ?? []) {
      const current = addressMap.get(address.user_id) ?? [];
      current.push(address);
      addressMap.set(address.user_id, current);
    }

    const customers = (data ?? []).map((profile) => ({
      ...profile,
      addresses: addressMap.get(profile.user_id) ?? [],
      order_summary: summary.get(profile.user_id) ?? { count: 0, total: 0, lastOrder: null, lastStatus: null },
    }));

    const total = count ?? 0;
    return NextResponse.json({
      customers,
      pagination: {
        page,
        page_size: PAGE_SIZE,
        total,
        total_pages: Math.ceil(total / PAGE_SIZE),
        has_next: from + customers.length < total,
        has_previous: page > 1,
      },
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Customer CRM request failed:", error);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}
