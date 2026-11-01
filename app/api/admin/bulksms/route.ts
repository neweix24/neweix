import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServerSetting } from "@/lib/phone-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function authorizeAdmin(): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const supabase = await createServerSupabaseClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (authError || typeof userId !== "string") {
    return { ok: false, error: "Authentication required.", status: 401 };
  }

  const { data: profile, error } = await supabase
    .from("staff_profiles")
    .select("role,is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true || !["supreme", "admin"].includes(profile.role)) {
    return { ok: false, error: "You are not authorized to perform this action.", status: 403 };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance.currentLevel !== "aal2") {
      return { ok: false, error: "Complete MFA for the Supreme account.", status: 403 };
    }
  }

  return { ok: true };
}

function extractProviderError(raw: string): number | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const value = record.response_code ?? record.code ?? record.status;
      if (typeof value === "number" || typeof value === "string") {
        const numeric = Number(value);
        if (Number.isInteger(numeric) && numeric >= 1000 && numeric <= 1999) return numeric;
      }
    }
  } catch {
    // The provider may return a plain-text response.
  }
  const match = raw.trim().match(/^(10\d{2})$/);
  return match ? Number(match[1]) : null;
}

export async function GET() {
  const auth = await authorizeAdmin();
  if (!auth.ok) return fail(auth.error, auth.status);

  const apiKey = getServerSetting("BULKSMSBD_API_KEY");
  const senderId = getServerSetting("BULKSMSBD_SENDER_ID");
  if (!apiKey || !senderId) {
    return fail("BulkSMSBD API key or approved Sender ID is not configured in Cloudflare.", 503);
  }

  const form = new FormData();
  form.set("api_key", apiKey);

  try {
    const response = await fetch("https://bulksmsbd.net/api/getBalanceApi", {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const raw = (await response.text()).trim().replaceAll(apiKey, "[redacted]").slice(0, 300);
    const providerError = extractProviderError(raw);

    if (!response.ok || providerError !== null || !raw) {
      const message = providerError === 1032
        ? "BulkSMSBD rejected the request because the source IP is not whitelisted."
        : providerError === 1031
          ? "The BulkSMSBD account is not verified."
          : providerError === 1011
            ? "BulkSMSBD could not find this account."
            : "BulkSMSBD did not return a valid balance response.";
      console.error("BulkSMSBD balance check failed:", { httpStatus: response.status, providerError });
      return fail(message, 502);
    }

    return NextResponse.json({
      connected: true,
      senderIdConfigured: true,
      providerResponse: raw,
      checkedAt: new Date().toISOString(),
      message: "BulkSMSBD balance endpoint responded. This does not verify handset delivery.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("BulkSMSBD balance check request failed:", error instanceof Error ? error.message : "unknown error");
    return fail("Could not connect to BulkSMSBD. Try again later.", 502);
  }
}
