import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = [
  "rent", "salary", "utilities", "marketing", "packaging", "transport",
  "warehouse", "software", "maintenance", "office", "other",
] as const;

function responseError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function authorizeSupreme() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await session.auth.getUser();

  if (userError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: profile, error } = await session
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true || profile.role !== "supreme") {
    return { error: "Only an active Supreme account can manage operating expenses.", status: 403 as const };
  }

  const { data: assurance, error: mfaError } =
    await session.auth.mfa.getAuthenticatorAssuranceLevel();

  if (mfaError || assurance?.currentLevel !== "aal2") {
    return { error: "Complete MFA verification for the Supreme account.", status: 403 as const };
  }

  return { userId: user.id };
}

async function getServiceClient() {
  const { env } = await getCloudflareContext();
  const runtimeEnv = env as Record<string, unknown>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (typeof url !== "string" || !url || typeof key !== "string" || !key) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + "T00:00:00Z"));
}

export async function GET(request: Request) {
  try {
    const actor = await authorizeSupreme();
    if ("error" in actor) return responseError(actor.error, actor.status);

    const params = new URL(request.url).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
      return responseError("Provide a valid expense date range.", 400);
    }

    const page = Math.max(1, Math.min(10000, Number(params.get("page") || 1)));
    const pageSize = 50;
    const supabase = await getServiceClient();
    let query = supabase
      .from("operating_expenses")
      .select("id, expense_date, category, amount, description, vendor, reference_number, created_at", { count: "exact" })
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (from) query = query.gte("expense_date", from);
    if (to) query = query.lte("expense_date", to);

    const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) {
      console.error("Supreme expense list failed:", error.message);
      return responseError("Could not load operating expenses.", 500);
    }

    return NextResponse.json({
      success: true,
      expenses: data ?? [],
      pagination: { page, pageSize, total: count ?? 0 },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Supreme expense GET failed:", error);
    return responseError("A server error occurred.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorizeSupreme();
    if ("error" in actor) return responseError(actor.error, actor.status);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) {
      return responseError("Request is too large.", 413);
    }

    let body: unknown;
    try { body = JSON.parse(raw); } catch { return responseError("Invalid JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return responseError("Provide valid expense details.", 400);
    }

    const input = body as Record<string, unknown>;
    const category = input.category;
    const amount = input.amount;
    const description = typeof input.description === "string" ? input.description.trim() : "";
    const vendor = input.vendor == null || input.vendor === "" ? null
      : typeof input.vendor === "string" ? input.vendor.trim() : undefined;
    const reference = input.reference_number == null || input.reference_number === "" ? null
      : typeof input.reference_number === "string" ? input.reference_number.trim() : undefined;

    if (typeof category !== "string" || !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
      return responseError("Select a valid expense category.", 400);
    }
    if (!Number.isSafeInteger(amount) || Number(amount) <= 0 || Number(amount) > 1000000000) {
      return responseError("Enter a valid expense amount in BDT.", 400);
    }
    if (!validDate(input.expense_date)) return responseError("Select a valid expense date.", 400);
    if (description.length < 3 || description.length > 1000) {
      return responseError("Description must be between 3 and 1,000 characters.", 400);
    }
    if (vendor === undefined || (vendor !== null && (vendor.length < 2 || vendor.length > 160))) {
      return responseError("Enter a valid vendor name.", 400);
    }
    if (reference === undefined || (reference !== null && (reference.length < 1 || reference.length > 120))) {
      return responseError("Enter a valid reference number.", 400);
    }

    const supabase = await getServiceClient();
    const { data, error } = await supabase
      .from("operating_expenses")
      .insert({
        expense_date: input.expense_date,
        category,
        amount: Number(amount),
        description,
        vendor,
        reference_number: reference,
        created_by: actor.userId,
      })
      .select("id, expense_date, category, amount, description, vendor, reference_number, created_at")
      .single();

    if (error || !data) {
      console.error("Supreme expense create failed:", error?.message);
      return responseError("Could not record the operating expense.", 500);
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor_id: actor.userId,
      action: "finance.expense.created",
      target_type: "operating_expense",
      target_id: data.id,
      details: { category: data.category, amount: data.amount, expense_date: data.expense_date },
    });
    if (auditError) {
      console.error("Expense audit log write failed:", auditError.message);
      return responseError("Expense was recorded, but its audit entry failed. Contact support before retrying.", 500);
    }

    return NextResponse.json({ success: true, expense: data }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Supreme expense POST failed:", error);
    return responseError("A server error occurred.", 500);
  }
}
