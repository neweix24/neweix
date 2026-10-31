import { NextResponse } from "next/server";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";
import { decryptYouTubeToken, encryptYouTubeToken, getYouTubeEnv } from "@/lib/social/youtube-oauth";

export const dynamic = "force-dynamic";

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type ChannelResponse = { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
type PlaylistResponse = { items?: Array<{ snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string }; default?: { url?: string } } }; contentDetails?: { videoId?: string } }> };

export async function GET() {
  try {
    const env = await getYouTubeEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.YOUTUBE_TOKEN_ENCRYPTION_KEY) {
      return NextResponse.json({ videos: [], configured: false }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
    }

    const supabase = await createRuntimeServiceClient();
    const { data: account, error } = await supabase
      .from("social_media_accounts")
      .select("id, external_account_id, refresh_token_ciphertext")
      .eq("platform", "youtube")
      .eq("connection_status", "connected")
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!account?.refresh_token_ciphertext) {
      return NextResponse.json({ videos: [], configured: false }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
    }

    const refreshToken = await decryptYouTubeToken(account.refresh_token_ciphertext, env.YOUTUBE_TOKEN_ENCRYPTION_KEY);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(12000),
    });
    const tokens = await tokenResponse.json() as TokenResponse;
    if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error || "YouTube token refresh failed.");

    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const channelResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(account.external_account_id)}`, { headers, signal: AbortSignal.timeout(12000) });
    const channelData = await channelResponse.json() as ChannelResponse;
    if (!channelResponse.ok) throw new Error("YouTube channel lookup failed.");
    const uploadsPlaylist = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylist) throw new Error("YouTube uploads playlist not found.");

    const playlistResponse = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylist)}&maxResults=8`, { headers, signal: AbortSignal.timeout(12000) });
    const playlistData = await playlistResponse.json() as PlaylistResponse;
    if (!playlistResponse.ok) throw new Error("YouTube videos could not be loaded.");

    const videos = (playlistData.items ?? []).flatMap((item) => {
      const id = item.contentDetails?.videoId;
      if (!id) return [];
      return [{ id, title: item.snippet?.title || "NEWEIX ভিডিও", publishedAt: item.snippet?.publishedAt || null, thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }];
    });

    const encryptedAccess = await encryptYouTubeToken(tokens.access_token, env.YOUTUBE_TOKEN_ENCRYPTION_KEY);
    await supabase.from("social_media_accounts").update({
      access_token_ciphertext: encryptedAccess,
      token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", account.id);

    return NextResponse.json({ videos, configured: true }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
  } catch (error) {
    console.error("[homepage-youtube] feed failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ videos: [], configured: false }, { status: 200, headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } });
  }
}
