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
  await requireStaff(["supreme", "admin"]);
  try {
    const supabase = await createServerSupabaseClient();
    const [accountsResult, postsResult] = await Promise.all([
      supabase.from("social_media_accounts").select("id,platform,account_name,connection_status,connected_at").order("platform"),
      supabase.from("social_media_posts").select("id,title,caption,media_urls,post_targets,status,scheduled_at,created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (postsResult.error) throw postsResult.error;
    return NextResponse.json({ accounts: accountsResult.data ?? [], posts: postsResult.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete the request.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  const staff = await requireStaff(["supreme", "admin"]);
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const caption = typeof body.caption === "string" ? body.caption.trim() : "";
    const targets = Array.isArray(body.targets) ? body.targets : [];
    const mediaUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls : [];
    const status = body.status;
    const scheduledAt = body.scheduledAt;
    if (!title || title.length > 200) return NextResponse.json({ error: "Title must be between 1 and 200 characters." }, { status: 400 });
    if (!caption || caption.length > 5000) return NextResponse.json({ error: "Caption must be between 1 and 5,000 characters." }, { status: 400 });
    if (targets.length < 1 || targets.length > 4 || targets.some((target) => typeof target !== "string" || !PLATFORMS.includes(target as typeof PLATFORMS[number])) || new Set(targets).size !== targets.length) {
      return NextResponse.json({ error: "Select at least one and no more than four valid platforms." }, { status: 400 });
    }
    if (status !== "draft" && status !== "scheduled") return NextResponse.json({ error: "Invalid post status." }, { status: 400 });
    if (mediaUrls.length > 10 || mediaUrls.some((url) =>
      typeof url !== "string" || url.length > 2048 || !/^https:\/\//i.test(url) ||
      (() => { try { const parsed = new URL(url); return Boolean(parsed.username || parsed.password); } catch { return true; } })()
    )) {
      return NextResponse.json({ error: "Video/media URLs must be valid HTTPS URLs (maximum 10)." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    let parsedSchedule: string | null = null;
    if (status === "scheduled") {
      if (targets.some((target) => target !== "youtube")) {
        return NextResponse.json({ error: "Automatic publishing is currently available only for YouTube. Save Facebook, Instagram, and TikTok posts as drafts." }, { status: 400 });
      }
      if (mediaUrls.length !== 1) {
        return NextResponse.json({ error: "Provide exactly one public HTTPS video URL for a YouTube post." }, { status: 400 });
      }
      const { data: youtubeAccount, error: accountError } = await supabase
        .from("social_media_accounts")
        .select("id")
        .eq("platform", "youtube")
        .eq("connection_status", "connected")
        .limit(1)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!youtubeAccount) {
        return NextResponse.json({ error: "Connect a YouTube channel with Google first." }, { status: 409 });
      }
      if (typeof scheduledAt !== "string" || !Number.isFinite(Date.parse(scheduledAt))) return NextResponse.json({ error: "Provide a valid publication time." }, { status: 400 });
      const time = Date.parse(scheduledAt);
      if (time < Date.now() + 60_000 || time > Date.now() + 366 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: "Publication time must be at least 1 minute in the future and within one year." }, { status: 400 });
      parsedSchedule = new Date(time).toISOString();
    }

    const { data, error } = await supabase.from("social_media_posts").insert({
      created_by: staff.user.id,
      title,
      caption,
      media_urls: mediaUrls,
      post_targets: targets,
      status,
      scheduled_at: parsedSchedule,
    }).select("id,title,caption,media_urls,post_targets,status,scheduled_at,created_at").single();
    if (error) throw error;
    return NextResponse.json({ post: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the post.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
