import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RuntimeBindings = Record<string, unknown>;

function getBindings(): RuntimeBindings {
  try {
    const { env } = getCloudflareContext();
    return env as RuntimeBindings;
  } catch {
    return {};
  }
}

export function getServerSetting(name: string): string | null {
  const runtimeValue = getBindings()[name];
  if (typeof runtimeValue === "string" && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  const processValue = process.env[name];
  return typeof processValue === "string" && processValue.trim()
    ? processValue.trim()
    : null;
}

export function normalizeBangladeshPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, "");
  let digits = compact.replace(/^\+/, "");

  if (digits.startsWith("00880")) digits = digits.slice(2);
  if (/^01[3-9]\d{8}$/.test(digits)) digits = `88${digits}`;

  if (!/^8801[3-9]\d{8}$/.test(digits)) return null;
  return `+${digits}`;
}

export function maskBangladeshPhone(phone: string): string {
  return phone.length >= 8
    ? `${phone.slice(0, 6)}••••${phone.slice(-3)}`
    : "••••••••";
}

export async function getAuthenticatedCustomer(): Promise<{ id: string } | null> {
  try {
    // Verify the cookie-backed customer session with Supabase Auth itself.
    // getUser() is the same server-side validation path used by the profile
    // bootstrap endpoint; relying on locally decoded claims here caused valid
    // Google OAuth sessions to be rejected by the OTP endpoints.
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (error || typeof userId !== "string" || !userId) {
      if (error) console.warn("Customer session validation failed:", error.message);
      return null;
    }
    return { id: userId };
  } catch (error) {
    console.warn(
      "Customer session validation unavailable:",
      error instanceof Error ? error.message : "unknown error"
    );
    return null;
  }
}

export function createAdminSupabaseClient() {
  const url = getServerSetting("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = getServerSetting("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function hashPhoneOtp(
  challengeId: string,
  userId: string,
  phone: string,
  otp: string
): Promise<string> {
  const pepper = getServerSetting("SUPABASE_SERVICE_ROLE_KEY");
  if (!pepper) throw new Error("OTP hashing configuration is missing.");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${challengeId}:${userId}:${phone}:${otp}`)
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
