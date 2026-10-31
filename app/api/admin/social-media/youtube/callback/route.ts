import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createRuntimeServiceClient } from "@/lib/supabase/runtime-service-client";
import { encryptYouTubeToken, getYouTubeEnv, youtubeRedirectUri } from "@/lib/social/youtube-oauth";

export const dynamic = "force-dynamic";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type ChannelResponse = {
  items?: Array<{ id?: string; snippet?: { title?: string; customUrl?: string } }>;
};

export async function GET(request: NextRequest) {
  const staff = await requireStaff(["supreme", "admin"]);
  const siteUrl = (await getYouTubeEnv()).NEXT_PUBLIC_SITE_URL || "https://neweix.com";
  const redirectBack = (key: string) => NextResponse.redirect(new URL(`/admin/social-media?youtube=${encodeURIComponent(key)}`, siteUrl));
  const returnedState = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get("neweix_youtube_oauth_state")?.value;
  if (!returnedState || !cookieState || returnedState.length !== cookieState.length || !crypto.subtle) {
    return redirectBack("state_error");
  }
  let mismatch = 0;
  for (let index = 0; index < returnedState.length; index += 1) mismatch |= returnedState.charCodeAt(index) ^ cookieState.charCodeAt(index);
  if (mismatch !== 0) return redirectBack("state_error");

  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) return redirectBack("consent_denied");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return redirectBack("missing_code");

  const env = await getYouTubeEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.YOUTUBE_TOKEN_ENCRYPTION_KEY) {
    return redirectBack("missing_secrets");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: youtubeRedirectUri(siteUrl),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const tokens = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || tokens.error || "Google token exchange failed.");

    const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    const channelData = await channelResponse.json() as ChannelResponse;
    if (!channelResponse.ok) throw new Error("YouTube channel lookup failed.");
    const channel = channelData.items?.[0];
    if (!channel?.id) throw new Error("এই Google অ্যাকাউন্টে কোনো YouTube channel পাওয়া যায়নি.");

    const supabase = await createRuntimeServiceClient();
    const { data: existing, error: lookupError } = await supabase
      .from("social_media_accounts")
      .select("refresh_token_ciphertext")
      .eq("platform", "youtube")
      .eq("external_account_id", channel.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const encryptedAccess = await encryptYouTubeToken(tokens.access_token, env.YOUTUBE_TOKEN_ENCRYPTION_KEY);
    const encryptedRefresh = tokens.refresh_token
      ? await encryptYouTubeToken(tokens.refresh_token, env.YOUTUBE_TOKEN_ENCRYPTION_KEY)
      : existing?.refresh_token_ciphertext ?? null;
    if (!encryptedRefresh) throw new Error("Google refresh token দেয়নি। Google consent পুনরায় দিন; refresh token ছাড়া scheduled publishing সম্ভব নয়.");

    const { error: saveError } = await supabase.from("social_media_accounts").upsert({
      platform: "youtube",
      account_name: channel.snippet?.title || channel.snippet?.customUrl || "YouTube channel",
      external_account_id: channel.id,
      access_token_ciphertext: encryptedAccess,
      refresh_token_ciphertext: encryptedRefresh,
      token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scopes: (tokens.scope || "").split(" ").filter(Boolean),
      connection_status: "connected",
      connected_by: staff.user.id,
      connected_at: new Date().toISOString(),
      last_error: null,
      metadata: { channel_title: channel.snippet?.title ?? null, custom_url: channel.snippet?.customUrl ?? null },
      updated_at: new Date().toISOString(),
    }, { onConflict: "platform,external_account_id" });
    if (saveError) throw saveError;

    const response = redirectBack("connected");
    response.cookies.set("neweix_youtube_oauth_state", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/social-media/youtube", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("[youtube-oauth] callback failed", error instanceof Error ? error.message : "unknown error");
    return redirectBack("connection_failed");
  }
}
