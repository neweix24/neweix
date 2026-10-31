import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const EIX_ID_REGEX = /^EIX-[A-F0-9]{8}$/;
const REQUEST_KEY_REGEX = /^[A-Za-z0-9:_-]{8,100}$/;
function errorStatus(code?: string) {
  if (code === "28000") return 401;
  if (code === "42501") return 403;
  if (code === "55000") return 409;
  if (code === "22023") return 400;
  return 500;
}
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) {
      return NextResponse.json({ error: "অনুরোধটি অনেক বড়।" }, { status: 413, headers });
    }
    let body: unknown;
    try { body = JSON.parse(raw); } catch {
      return NextResponse.json({ error: "সঠিক JSON অনুরোধ দিন।" }, { status: 400, headers });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "অনুরোধের তথ্য সঠিক নয়।" }, { status: 400, headers });
    }
    const payload = body as Record<string, unknown>;
    const recipientEixId = typeof payload.recipientEixId === "string" ? payload.recipientEixId.trim().toUpperCase() : "";
    const amount = payload.amount;
    const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
    const requestKey = typeof payload.requestKey === "string" ? payload.requestKey : "";
    if (!EIX_ID_REGEX.test(recipientEixId)) return NextResponse.json({ error: "সঠিক EIX ID লিখুন।" }, { status: 400, headers });
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) {
      return NextResponse.json({ error: "Eixon পরিমাণ সঠিক নয়।" }, { status: 400, headers });
    }
    if (reason.length > 240 || !REQUEST_KEY_REGEX.test(requestKey)) {
      return NextResponse.json({ error: "কারণ বা অনুরোধের পরিচিতি সঠিক নয়।" }, { status: 400, headers });
    }
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "লগইন প্রয়োজন।" }, { status: 401, headers });
    const { data, error } = await supabase.rpc("eixpay_request_transfer", {
      p_recipient_eix_id: recipientEixId, p_amount: amount, p_reason: reason, p_idempotency_key: requestKey,
    });
    if (error) {
      const status = errorStatus(error.code);
      return NextResponse.json({
        error: error.code === "55000" ? "Eixon ট্রান্সফার বর্তমানে বন্ধ আছে। প্রয়োজনীয় যাচাই ও অনুমোদনের পর চালু হবে।"
          : error.code === "22023" ? "ট্রান্সফারের তথ্য যাচাই করুন।"
          : status === 403 ? "এই কার্যক্রমের অনুমতি নেই।" : "ট্রান্সফারের অনুরোধ সম্পন্ন করা যায়নি।",
      }, { status, headers });
    }
    return NextResponse.json({ success: true, result: data }, { status: 201, headers });
  } catch (error) {
    console.error("EixPay transfer request failed:", error);
    return NextResponse.json({ error: "ট্রান্সফারের অনুরোধ সম্পন্ন করা যায়নি।" }, { status: 500, headers });
  }
}
