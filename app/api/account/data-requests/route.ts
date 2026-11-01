import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("customer_data_requests")
    .select("id,request_type,status,customer_message,resolution_note,created_at,updated_at,processed_at")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Customer data request list failed:", error.message);
    return NextResponse.json({ error: "Unable to load data requests." }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4096) {
    return NextResponse.json({ error: "The request payload is too large." }, { status: 413 });
  }

  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 }); }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Submit a valid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const requestType = input.request_type;
  const message = typeof input.customer_message === "string" ? input.customer_message.trim() : "";

  if (requestType !== "correction" && requestType !== "delete") {
    return NextResponse.json({ error: "Invalid request type." }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: "The message must be 1,000 characters or fewer." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("customer_data_requests")
    .insert({
      user_id: authData.user.id,
      request_type: requestType,
      customer_message: message || null,
    })
    .select("id,request_type,status,created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A request of this type is already pending or in progress." }, { status: 409 });
    }
    console.error("Customer data request create failed:", error.message);
    return NextResponse.json({ error: "Unable to submit the request." }, { status: 500 });
  }

  return NextResponse.json({ success: true, request: data }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
