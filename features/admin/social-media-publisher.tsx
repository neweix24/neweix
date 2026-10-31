"use client";

import { useCallback, useEffect, useState } from "react";

type Platform = "facebook" | "instagram" | "tiktok" | "youtube";
type Account = { id: string; platform: Platform; account_name: string; connection_status: string };
type Post = { id: string; title: string; caption: string; post_targets: Platform[]; status: string; scheduled_at: string | null; created_at: string };

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
  const [targets, setTargets] = useState<Platform[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/social-media", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "তথ্য লোড করা যায়নি।");
    setAccounts(data.accounts ?? []);
    setPosts(data.posts ?? []);
  }, []);

  useEffect(() => {
    load().catch((error) => setStatus(error instanceof Error ? error.message : "লোড ব্যর্থ হয়েছে।"));
    const result = new URLSearchParams(window.location.search).get("youtube");
    const messages: Record<string, string> = {
      connected: "YouTube চ্যানেল সফলভাবে সংযুক্ত হয়েছে।",
      missing_credentials: "Google OAuth Client ID ও Client Secret Cloudflare-এ সেট করা হয়নি।",
      missing_secrets: "Google OAuth এবং Token Encryption secrets সেট করা প্রয়োজন।",
      state_error: "নিরাপত্তা যাচাই ব্যর্থ হয়েছে। আবার সংযোগ চেষ্টা করুন।",
      consent_denied: "Google অনুমতি দেওয়া হয়নি।",
      missing_code: "Google থেকে authorization code পাওয়া যায়নি।",
      connection_failed: "YouTube সংযোগ ব্যর্থ হয়েছে। Server log পরীক্ষা করুন।",
    };
    if (result && messages[result]) setStatus(messages[result]);
  }, [load]);

  function toggleTarget(platform: Platform) {
    setTargets((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  }

  async function createPost(asDraft: boolean) {
    if (!title.trim() || !caption.trim() || targets.length === 0) {
      setStatus("শিরোনাম, ক্যাপশন এবং অন্তত একটি প্ল্যাটফর্ম নির্বাচন করুন।");
      return;
    }
    if (!asDraft && !scheduledAt) {
      setStatus("প্রকাশের তারিখ ও সময় নির্ধারণ করুন।");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/social-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, caption, targets, scheduledAt: asDraft ? null : new Date(scheduledAt).toISOString(), status: asDraft ? "draft" : "scheduled" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "পোস্ট সংরক্ষণ করা যায়নি।");
      setTitle("");
      setCaption("");
      setTargets([]);
      setScheduledAt("");
      setStatus(asDraft ? "ড্রাফট সংরক্ষণ হয়েছে।" : "পোস্ট শিডিউল হয়েছে। সংযুক্ত অ্যাকাউন্ট ও API অনুমোদন ছাড়া এটি প্রকাশ হবে না।");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "পোস্ট সংরক্ষণ ব্যর্থ হয়েছে।");
    } finally {
      setBusy(false);
    }
  }

  const cardStyle = { borderColor: "var(--border)", background: "var(--surface)" };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-5 sm:p-7" style={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">প্ল্যাটফর্ম সংযোগ</h2><p className="mt-1 text-sm opacity-70">অফিসিয়াল OAuth/API সংযোগের অবস্থা</p></div>
          <span className="rounded-full border px-3 py-1 text-xs">প্রাথমিক সেটআপ</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {platforms.map((platform) => {
            const linked = accounts.filter((account) => account.platform === platform.id && account.connection_status === "connected");
            return <div key={platform.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between gap-2"><strong>{platform.label}</strong><span className="text-xs">{linked.length ? "সংযুক্ত" : "সংযুক্ত নয়"}</span></div>
              <p className="mt-1 text-xs opacity-70">{platform.note}</p>
              {linked.length > 0 ? linked.map((account) => <p key={account.id} className="mt-2 text-sm">{account.account_name}</p>) : <p className="mt-2 text-sm opacity-70">Developer credentials ও OAuth অনুমোদন প্রয়োজন।</p>}
              {platform.id === "youtube" && <a href="/api/admin/social-media/youtube/connect" className="mt-3 inline-flex rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>{linked.length ? "YouTube পুনরায় সংযুক্ত করুন" : "Google দিয়ে YouTube সংযুক্ত করুন"}</a>}
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border p-5 sm:p-7" style={cardStyle}>
        <h2 className="text-xl font-bold">নতুন পোস্ট তৈরি</h2>
        <p className="mt-1 text-sm opacity-70">YouTube OAuth সংযোগ প্রথমে চালু হচ্ছে। ভিডিও আপলোড ও প্রকাশের সুবিধা পরবর্তী ধাপে যুক্ত হবে।</p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">পোস্টের শিরোনাম<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className="min-h-11 rounded-xl border bg-transparent px-3 font-normal" style={{ borderColor: "var(--border)" }} /></label>
          <label className="grid gap-2 text-sm font-semibold">ক্যাপশন / বিবরণ<textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={5000} rows={5} className="rounded-xl border bg-transparent p-3 font-normal" style={{ borderColor: "var(--border)" }} /></label>
          <fieldset><legend className="mb-2 text-sm font-semibold">কোন প্ল্যাটফর্মে যাবে?</legend><div className="grid gap-2 sm:grid-cols-2">{platforms.map((platform) => <label key={platform.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}><input type="checkbox" checked={targets.includes(platform.id)} onChange={() => toggleTarget(platform.id)} />{platform.label}</label>)}</div></fieldset>
          <label className="grid gap-2 text-sm font-semibold">প্রকাশের তারিখ ও সময়<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="min-h-11 rounded-xl border bg-transparent px-3 font-normal" style={{ borderColor: "var(--border)" }} /></label>
          <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => createPost(true)} className="rounded-xl border px-5 py-3 font-semibold" style={{ borderColor: "var(--border)" }}>ড্রাফট সংরক্ষণ</button><button type="button" disabled={busy} onClick={() => createPost(false)} className="rounded-xl border px-5 py-3 font-semibold" style={{ borderColor: "var(--border)" }}>শিডিউল করুন</button></div>
          {status && <p role="status" className="text-sm">{status}</p>}
        </div>
      </section>

      <section className="rounded-2xl border p-5 sm:p-7" style={cardStyle}>
        <h2 className="text-xl font-bold">পোস্টের তালিকা</h2>
        <div className="mt-4 space-y-3">{posts.length === 0 ? <p className="text-sm opacity-70">এখনো কোনো পোস্ট তৈরি হয়নি।</p> : posts.map((post) => <article key={post.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{post.title}</strong><span className="rounded-full border px-3 py-1 text-xs">{post.status}</span></div><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm opacity-80">{post.caption}</p><p className="mt-2 text-xs opacity-70">প্ল্যাটফর্ম: {post.post_targets.join(", ")}{post.scheduled_at ? " · " + new Date(post.scheduled_at).toLocaleString() : ""}</p></article>)}</div>
      </section>
    </div>
  );
}
