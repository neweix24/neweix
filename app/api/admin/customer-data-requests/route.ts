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
      .from("customer_data_requests")
      .select("id,user_id,request_type,status,customer_message,resolution_note,created_at,updated_at")
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("Admin data request list failed:", error.message);
      return NextResponse.json({ error: "গ্রাহকের অনুরোধ লোড করা যায়নি।" }, { status: 500 });
    }
    return NextResponse.json({ requests: data ?? [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Admin data request API failed:", error);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getAdminApiActor();
  if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4096) {
    return NextResponse.json({ error: "অনুরোধটি অতিরিক্ত বড়।" }, { status: 413 });
  }

  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "অবৈধ JSON।" }, { status: 400 }); }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "সঠিক অনুরোধ পাঠান।" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const id = input.id;
  const status = input.status;
  const note = typeof input.resolution_note === "string" ? input.resolution_note.trim() : "";

  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "সঠিক Request ID দিন।" }, { status: 400 });
  }
  if (!["processing", "completed", "rejected"].includes(String(status))) {
    return NextResponse.json({ error: "অনুরোধের নতুন অবস্থা সঠিক নয়।" }, { status: 400 });
  }
  if (note.length > 1000) {
    return NextResponse.json({ error: "নোট সর্বোচ্চ ১০০০ অক্ষরের হতে পারবে।" }, { status: 400 });
  }

  try {
    const admin = await createRuntimeServiceClient();
    const { data: current, error: currentError } = await admin
      .from("customer_data_requests")
      .select("id,user_id,request_type,status")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "অনুরোধটি পাওয়া যায়নি।" }, { status: 404 });

    if (current.status === "completed" || current.status === "rejected") {
      return NextResponse.json({ error: "চূড়ান্ত হওয়া অনুরোধ আর পরিবর্তন করা যাবে না।" }, { status: 409 });
    }

    const { data, error } = await admin
      .from("customer_data_requests")
      .update({
        status,
        resolution_note: note || null,
        processed_by: actor.user.id,
        processed_at: status === "completed" || status === "rejected" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select("id,user_id,request_type,status,resolution_note,processed_at,updated_at")
      .single();
    if (error) throw error;

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: actor.user.id,
      action: "customer_data_request_status_updated",
      target_type: "customer_data_request",
      target_id: id,
      details: { request_type: current.request_type, previous_status: current.status, new_status: status },
    });
    if (auditError) console.error("Customer data request audit log failed:", auditError.message);

    return NextResponse.json({ success: true, request: data }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Admin data request update failed:", error);
    return NextResponse.json({ error: "অনুরোধের অবস্থা আপডেট করা যায়নি।" }, { status: 500 });
  }
}
