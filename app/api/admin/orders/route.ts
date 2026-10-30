import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getStaffContext() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "লগইন প্রয়োজন।", status: 401 as const };
  }

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    error ||
    !profile ||
    profile.is_active !== true ||
    !["supreme", "admin"].includes(profile.role)
  ) {
    return { error: "এই কাজের অনুমতি নেই।", status: 403 as const };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (assuranceError || assurance.currentLevel !== "aal2") {
      return { error: "Supreme অ্যাকাউন্টে MFA সম্পন্ন করুন।", status: 403 as const };
    }
  }

  return { user, role: profile.role, supabase };
}

async function getAdminClient() {
  const context = await getCloudflareContext();
  const env = context.env as Record<string, string | undefined>;

  const url =
    env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  try {
    const staff = await getStaffContext();
    if ("error" in staff) {
      return NextResponse.json(
        { error: staff.error },
        { status: staff.status }
      );
    }

    const admin = await getAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        customer_phone,
        phone,
        address,
        shipping_address,
        shipping_city,
        status,
        subtotal,
        delivery_fee,
        total,
        payment_method,
        payment_status,
        payment_transaction_id,
        payment_verified_at,
        created_at,
        order_items (
          id,
          product_name:product_name_snapshot,
          unit_price,
          quantity
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Admin orders query failed:", error.message);
      return NextResponse.json(
        { error: "অর্ডার লোড করা যায়নি। ডেটাবেসের কলাম যাচাই করুন।" },
        { status: 500 }
      );
    }

    return NextResponse.json({ orders: data ?? [] });
  } catch (error) {
    console.error("Admin orders GET failed:", error);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const staff = await getStaffContext();
    if ("error" in staff) {
      return NextResponse.json(
        { error: staff.error },
        { status: staff.status }
      );
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) {
      return NextResponse.json({ error: "অনুরোধটি অতিরিক্ত বড়।" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "অবৈধ JSON।" }, { status: 400 });
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("orderId" in body) ||
      typeof body.orderId !== "string" ||
      !UUID_REGEX.test(body.orderId)
    ) {
      return NextResponse.json({ error: "সঠিক Order ID দিন।" }, { status: 400 });
    }

    const orderId = body.orderId;
    const admin = await getAdminClient();

    const { data, error } = await admin.rpc("admin_verify_order_payment", {
      p_order_id: orderId,
      p_actor_id: staff.user.id,
    });

    if (error) {
      if (error.message.includes("ORDER_NOT_VERIFIABLE")) {
        return NextResponse.json(
          {
            error:
              "এই অর্ডার যাচাই করা যাচ্ছে না। পেমেন্ট স্ট্যাটাস ও Transaction ID পরীক্ষা করুন।",
          },
          { status: 409 }
        );
      }

      console.error("Payment verification RPC failed:", error.message);
      return NextResponse.json(
        { error: "পেমেন্ট যাচাই ব্যর্থ। SQL migration প্রয়োগ হয়েছে কি না দেখুন।" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: data,
      message: "পেমেন্ট Paid হিসেবে সংরক্ষিত হয়েছে এবং অডিট লগ তৈরি হয়েছে।",
    });
  } catch (error) {
    console.error("Admin orders POST failed:", error);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const staff = await getStaffContext();

    if ("error" in staff) {
      return NextResponse.json(
        { error: staff.error },
        { status: staff.status }
      );
    }

    const raw = await request.text();

    if (new TextEncoder().encode(raw).byteLength > 8192) {
      return NextResponse.json(
        { error: "অনুরোধটি অতিরিক্ত বড়।" },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "অবৈধ JSON।" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "সঠিক অনুরোধ পাঠান।" },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;
    const orderId = input.orderId;
    const status = input.status;

    const allowedStatuses = [
      "pending", "confirmed", "processing", "packed",
      "shipped", "delivered", "cancelled", "returned"
    ];

    if (typeof orderId !== "string" || !UUID_REGEX.test(orderId)) {
      return NextResponse.json(
        { error: "সঠিক Order ID দিন।" },
        { status: 400 }
      );
    }

    if (typeof status !== "string" || !allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: "অবৈধ অর্ডার স্ট্যাটাস।" },
        { status: 400 }
      );
    }

    const admin = await getAdminClient();

    const { data, error } = await admin.rpc("admin_update_order_status", {
      p_order_id: orderId,
      p_new_status: status,
      p_actor_id: staff.user.id,
    });

    if (error) {
      if (error.message.includes("ORDER_NOT_FOUND")) {
        return NextResponse.json(
          { error: "অর্ডারটি পাওয়া যায়নি।" },
          { status: 404 }
        );
      }

      if (error.message.includes("ORDER_CANNOT_BE_CANCELLED")) {
        return NextResponse.json(
          { error: "পাঠানো বা ডেলিভারি সম্পন্ন অর্ডার সরাসরি বাতিল করা যাবে না। Return গ্রহণ ও পণ্য পরীক্ষা করে আলাদা প্রক্রিয়ায় স্টক আপডেট করুন।" },
          { status: 409 }
        );
      }

      console.error("Order status update RPC failed:", error.message);
      return NextResponse.json(
        { error: "অর্ডারের স্ট্যাটাস পরিবর্তন করা যায়নি।" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: data,
      message: "অর্ডারের স্ট্যাটাস আপডেট হয়েছে।",
    });
  } catch (error) {
    console.error("Admin orders PATCH failed:", error);
    return NextResponse.json(
      { error: "সার্ভারে সমস্যা হয়েছে।" },
      { status: 500 }
    );
  }
}
