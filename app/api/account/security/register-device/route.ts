import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/phone-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDevice(userAgent: string) {
  const deviceType = /ipad|tablet/i.test(userAgent)
    ? "tablet"
    : /mobile|android|iphone|ipod/i.test(userAgent)
      ? "mobile"
      : userAgent ? "desktop" : "unknown";
  const operatingSystem =
    /Windows NT/i.test(userAgent) ? "Windows" :
    /Android/i.test(userAgent) ? "Android" :
    /iPhone|iPad|iPod/i.test(userAgent) ? "iOS" :
    /Mac OS X/i.test(userAgent) ? "macOS" :
    /Linux/i.test(userAgent) ? "Linux" : "unknown";
  const browser =
    /Edg\//i.test(userAgent) ? "Edge" :
    /Firefox\//i.test(userAgent) ? "Firefox" :
    /Chrome\//i.test(userAgent) ? "Chrome" :
    /Safari\//i.test(userAgent) ? "Safari" : "unknown";

  return { deviceType, operatingSystem, browser };
}

export async function POST(request: NextRequest) {
  let response = NextResponse.json(
    { success: false },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: "লগইন প্রয়োজন।" }, { status: 401 });
    }

    const current = request.cookies.get("neweix_device_id")?.value ?? "";
    const deviceId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(current)
      ? current
      : crypto.randomUUID();

    response.cookies.set("neweix_device_id", deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    const userAgent = request.headers.get("user-agent")?.slice(0, 1000) ?? null;
    const parsed = parseDevice(userAgent ?? "");
    const admin = createAdminSupabaseClient();

    const { error: deviceError } = await admin
      .from("customer_devices")
      .upsert({
        user_id: data.user.id,
        device_id: deviceId,
        device_type: parsed.deviceType,
        operating_system: parsed.operatingSystem,
        browser: parsed.browser,
        user_agent: userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "user_id,device_id" });

    if (deviceError) throw deviceError;

    const clientIp = request.headers.get("cf-connecting-ip")?.trim() ?? "";
    const isPlausibleIp = clientIp.length <= 45 &&
      /^[0-9a-fA-F:.]+$/.test(clientIp) &&
      (clientIp.includes(".") || clientIp.includes(":"));

    if (isPlausibleIp) {
      const { error: ipError } = await admin
        .from("customer_device_access_logs")
        .insert({
          user_id: data.user.id,
          device_id: deviceId,
          ip_address: clientIp,
          user_agent: userAgent,
        });
      if (ipError) throw ipError;
    }

    response = NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
    response.cookies.set("neweix_device_id", deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    console.error("Customer security device registration failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "ডিভাইস নিরাপত্তা তথ্য সংরক্ষণ করা যায়নি।" }, { status: 503 });
  }
}
