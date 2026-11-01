"use client";

import { useCallback, useEffect, useState } from "react";

type Platform = "facebook" | "instagram" | "tiktok" | "youtube";
type Account = { id: string; platform: Platform; account_name: string; connection_status: string };
type Post = { id: string; title: string; caption: string; media_urls: string[]; post_targets: Platform[]; status: string; scheduled_at: string | null; created_at: string };

const platforms: { id: Platform; label: string; note: string }[] = [
  { id: "facebook", label: "Facebook Page", note: "Page publishing API" },
  { id: "instagram", label: "Instagram", note: "Professional account required" },
  { id: "tiktok", label: "TikTok", note: "Content Posting API approval required" },
  { id: "youtube", label: "YouTube", note: "Video upload API + Google OAuth" },
];

export default function SocialMediaPublisher() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [mediaUrls, setMediaUrls] = useState("");
  const [targets, setTargets] = useState<Platform[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/social-media", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load information.");
    setAccounts(data.accounts ?? []);
    setPosts(data.posts ?? []);
  }, []);

  useEffect(() => {
    load().catch((error) => setStatus(error instanceof Error ? error.message : "Loading failed."));
    const result = new URLSearchParams(window.location.search).get("youtube");
    const messages: Record<string, string> = {
      connected: "YouTube channel connected successfully.",
      missing_credentials: "Google OAuth Client ID and Client Secret are not configured in Cloudflare.",
      missing_secrets: "Google OAuth and token-encryption secrets must be configured.",
      state_error: "Security validation failed. Try connecting again.",
      consent_denied: "Google authorization was denied.",
      missing_code: "No authorization code was received from Google.",
      connection_failed: "YouTube connection failed. Check the server logs.",
    };
    if (result && messages[result]) setStatus(messages[result]);
  }, [load]);

  function toggleTarget(platform: Platform) {
    setTargets((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  }

  async function createPost(asDraft: boolean) {
    if (!title.trim() || !caption.trim() || targets.length === 0) {
      setStatus("Enter a title and caption, and select at least one platform.");
      return;
    }
    const mediaUrlList = mediaUrls.split("\n").map((value) => value.trim()).filter(Boolean);
    if (!asDraft && targets.some((target) => target !== "youtube")) {
      setStatus("Automatic publishing is currently available only for YouTube. Save posts for other platforms as drafts.");
      return;
    }
    if (!asDraft && mediaUrlList.length === 0) {
      setStatus("Enter a public HTTPS URL for the YouTube video.");
      return;
    }
    if (!asDraft && !scheduledAt) {
      setStatus("Set a publication date and time.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/social-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, caption, mediaUrls: mediaUrlList, targets, scheduledAt: asDraft ? null : new Date(scheduledAt).toISOString(), status: asDraft ? "draft" : "scheduled" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the post.");
      setTitle("");
      setCaption("");
      setMediaUrls("");
      setTargets([]);
      setScheduledAt("");
      setStatus(asDraft ? "Draft saved." : "YouTube video scheduled for publication. It will become public at the scheduled time.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save the post.");
    } finally {
      setBusy(false);
    }
  }

  const cardStyle = { borderColor: "var(--border)", background: "var(--surface)" };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-5 sm:p-7" style={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">Platform Connections</h2><p className="mt-1 text-sm opacity-70">Official OAuth/API connection status</p></div>
          <span className="rounded-full border px-3 py-1 text-xs">Initial Setup</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {platforms.map((platform) => {
            const linked = accounts.filter((account) => account.platform === platform.id && account.connection_status === "connected");
            return <div key={platform.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between gap-2"><strong>{platform.label}</strong><span className="text-xs">{linked.length ? "Connected" : "Not Connected"}</span></div>
              <p className="mt-1 text-xs opacity-70">{platform.note}</p>
              {linked.length > 0 ? linked.map((account) => <p key={account.id} className="mt-2 text-sm">{account.account_name}</p>) : <p className="mt-2 text-sm opacity-70">Developer credentials and OAuth authorization are required.</p>}
              {platform.id === "youtube" && <a href="/api/admin/social-media/youtube/connect" className="mt-3 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>{linked.length ? "Reconnect YouTube" : "Connect YouTube with Google"}</a>}
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border p-5 sm:p-7" style={cardStyle}>
        <h2 className="text-xl font-bold">Create New Post</h2>
        <p className="mt-1 text-sm opacity-70">Schedule automatic YouTube publishing with a video URL. Facebook, Instagram, and TikTok are draft-only until their respective API access is approved.</p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">Post Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className="min-h-11 rounded-xl border bg-transparent px-3 font-normal" style={{ borderColor: "var(--border)" }} /></label>
          <label className="grid gap-2 text-sm font-semibold">Caption / Description<textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={5000} rows={5} className="rounded-xl border bg-transparent p-3 font-normal" style={{ borderColor: "var(--border)" }} /></label>
          <label className="grid gap-2 text-sm font-semibold">Video URLs (one per line; required for YouTube)<textarea value={mediaUrls} onChange={(event) => setMediaUrls(event.target.value)} rows={3} placeholder="https://example.com/video.mp4" className="rounded-xl border bg-transparent p-3 font-normal" style={{ borderColor: "var(--border)" }} /></label>
          <fieldset><legend className="mb-2 text-sm font-semibold">Which platforms should receive this post?</legend><div className="grid gap-2 sm:grid-cols-2">{platforms.map((platform) => <label key={platform.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}><input type="checkbox" checked={targets.includes(platform.id)} onChange={() => toggleTarget(platform.id)} />{platform.label}</label>)}</div></fieldset>
          <label className="grid gap-2 text-sm font-semibold">Publication Date & Time<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="min-h-11 rounded-xl border bg-transparent px-3 font-normal" style={{ borderColor: "var(--border)" }} /></label>
          <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => createPost(true)} className="rounded-xl border px-5 py-3 font-semibold" style={{ borderColor: "var(--border)" }}>Save Draft</button><button type="button" disabled={busy} onClick={() => createPost(false)} className="rounded-xl border px-5 py-3 font-semibold" style={{ borderColor: "var(--border)" }}>Schedule</button></div>
          {status && <p role="status" className="text-sm">{status}</p>}
        </div>
      </section>

      <section className="rounded-2xl border p-5 sm:p-7" style={cardStyle}>
        <h2 className="text-xl font-bold">Post List</h2>
        <div className="mt-4 space-y-3">{posts.length === 0 ? <p className="text-sm opacity-70">No posts have been created yet.</p> : posts.map((post) => <article key={post.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{post.title}</strong><span className="rounded-full border px-3 py-1 text-xs">{post.status}</span></div><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm opacity-80">{post.caption}</p><p className="mt-2 text-xs opacity-70">Platforms: {post.post_targets.join(", ")}{post.scheduled_at ? " · " + new Date(post.scheduled_at).toLocaleString() : ""}</p>{post.media_urls?.length > 0 && <p className="mt-1 break-all text-xs opacity-60">Media: {post.media_urls.join(", ")}</p>}</article>)}</div>
      </section>
    </div>
  );
}
