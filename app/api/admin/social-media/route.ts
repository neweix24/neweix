import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;
const MAX_BODY_BYTES = 24 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    await requireStaff(["supreme", "admin"]);
    const supabase = await createServerSupabaseClient();
    const [accountsResult, postsResult] = await Promise.all([
      supabase.from("social_media_accounts").select("id,platform,account_name,connection_status,connected_at").order("platform"),
      supabase.from("social_media_posts").select("id,title,caption,post_targets,status,scheduled_at,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (postsResult.error) throw postsResult.error;
    return NextResponse.json({ accounts: accountsResult.data ?? [], posts: postsResult.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "অনুরোধ সম্পন্ন করা যায়নি।";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const staff = await requireStaff(["supreme", "admin"]);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "অনুরোধের আকার বেশি।" }, { status: 413 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: "অনুরোধের আকার বেশি।" }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "অবৈধ JSON।" }, { status: 400 }); }
    if (!isRecord(body)) return NextResponse.json({ error: "অবৈধ অনুরোধ।" }, { status: 400 });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const caption = typeof body.caption === "string" ? body.caption.trim() : "";
    const targets = Array.isArray(body.targets) ? body.targets : [];
    const status = body.status;
    const scheduledAt = body.scheduledAt;
    if (!title || title.length > 200) return NextResponse.json({ error: "শিরোনাম ১–২০০ অক্ষরের মধ্যে দিন।" }, { status: 400 });
    if (!caption || caption.length > 5000) return NextResponse.json({ error: "ক্যাপশন ১–৫০০০ অক্ষরের মধ্যে দিন।" }, { status: 400 });
    if (targets.length < 1 || targets.length > 4 || targets.some((target) => typeof target !== "string" || !PLATFORMS.includes(target as typeof PLATFORMS[number])) || new Set(targets).size !== targets.length) {
      return NextResponse.json({ error: "অন্তত একটি বৈধ এবং সর্বোচ্চ চারটি প্ল্যাটফর্ম নির্বাচন করুন।" }, { status: 400 });
    }
    if (status !== "draft" && status !== "scheduled") return NextResponse.json({ error: "অবৈধ পোস্ট স্ট্যাটাস।" }, { status: 400 });

    let parsedSchedule: string | null = null;
    if (status === "scheduled") {
      if (typeof scheduledAt !== "string" || !Number.isFinite(Date.parse(scheduledAt))) return NextResponse.json({ error: "বৈধ প্রকাশের সময় দিন।" }, { status: 400 });
      const time = Date.parse(scheduledAt);
      if (time < Date.now() + 60_000 || time > Date.now() + 366 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: "প্রকাশের সময় অন্তত ১ মিনিট পর এবং এক বছরের মধ্যে হতে হবে।" }, { status: 400 });
      parsedSchedule = new Date(time).toISOString();
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("social_media_posts").insert({
      created_by: staff.user.id,
      title,
      caption,
      post_targets: targets,
      status,
      scheduled_at: parsedSchedule,
    }).select("id,title,caption,post_targets,status,scheduled_at,created_at").single();
    if (error) throw error;
    return NextResponse.json({ post: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "পোস্ট সংরক্ষণ করা যায়নি।";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
