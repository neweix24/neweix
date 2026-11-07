import { NextResponse } from "next/server";
import { getServerSetting } from "@/lib/phone-verification";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
type Service = "neweix" | "eixon";
const allowedResources = new Set(["overview", "accounts", "journal-entries"]);

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function proxySupremeService(service: Service, resource: string) {
  if (!allowedResources.has(resource)) return fail("অনুমোদিত সার্ভিস রিসোর্স নয়।", 404);
  if (service === "neweix" && resource !== "overview") return fail("অনুমোদিত সার্ভিস রিসোর্স নয়।", 404);

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return fail("Supreme লগইন প্রয়োজন।", 401);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) return fail("Supreme সেশন পাওয়া যায়নি।", 401);

    const { data: assurance, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance?.currentLevel !== "aal2") {
      return fail("Supreme-এর সাম্প্রতিক MFA যাচাই প্রয়োজন।", 403);
    }

    // Neweix is the only public control-plane API. Eixon is reached internally
    // by this Edge Function using a separate HMAC-authenticated service channel.
    const supabaseUrl = getServerSetting("NEXT_PUBLIC_SUPABASE_URL");
    const apiKey = getServerSetting("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (!supabaseUrl || !apiKey) return fail("Neweix কেন্দ্রীয় API কনফিগারেশন অসম্পূর্ণ।", 503);

    const base = supabaseUrl.replace(/\/$/, "") + "/functions/v1/supreme-neweix-api";
    const endpoint = service === "neweix" ? resource : "eixon/" + resource;
    const url = base + "/" + endpoint;
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        apikey: apiKey,
        authorization: "Bearer " + session.access_token,
        accept: "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });

    const body = await upstream.text();
    if (body.length > 64 * 1024) return fail("সার্ভিসের উত্তর নির্ধারিত সীমার বেশি।", 502);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch {
      console.error("Neweix control plane returned non-JSON response:", upstream.status);
      return fail("কেন্দ্রীয় সার্ভিস থেকে সঠিক উত্তর পাওয়া যায়নি।", 502);
    }
    return NextResponse.json(payload, { status: upstream.status, headers });
  } catch (error) {
    console.error("Supreme control-plane proxy failed:", service, error);
    return fail("কেন্দ্রীয় সার্ভিস সাময়িকভাবে পাওয়া যাচ্ছে না।", 503);
  }
}
