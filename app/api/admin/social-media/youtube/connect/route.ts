import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getYouTubeEnv, youtubeRedirectUri } from "@/lib/social/youtube-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireStaff(["supreme", "admin"]);
  const env = await getYouTubeEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/admin/social-media?youtube=missing_credentials", env.NEXT_PUBLIC_SITE_URL));
  }

  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(stateBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: youtubeRedirectUri(env.NEXT_PUBLIC_SITE_URL || "https://neweix.com"),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set("neweix_youtube_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/admin/social-media/youtube",
    maxAge: 10 * 60,
  });
  return response;
}
