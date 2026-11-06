"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/ui/icon";

type Notification = {
  id: string;
  category: "orders" | "payments" | "delivery" | "inventory";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  href: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
};

const categoryLabels: Record<Notification["category"], string> = {
  orders: "অর্ডার",
  payments: "পেমেন্ট",
  delivery: "ডেলিভারি",
  inventory: "ইনভেন্টরি",
};

const severityLabels: Record<Notification["severity"], string> = {
  info: "তথ্য",
  warning: "সতর্কতা",
  critical: "জরুরি",
};

function severityStyle(severity: Notification["severity"]) {
  if (severity === "critical") return { borderColor: "rgba(248,113,113,.34)", background: "rgba(127,29,29,.12)", color: "#fca5a5" };
  if (severity === "warning") return { borderColor: "rgba(245,190,76,.34)", background: "rgba(161,98,7,.12)", color: "#fcd34d" };
  return { borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" };
}

function categoryIcon(category: Notification["category"]) {
  if (category === "orders") return "orders";
  if (category === "payments") return "wallet";
  if (category === "delivery") return "truck";
  return "package";
}

export default function SupremeNotificationInbox() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/supreme/notifications", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "নোটিফিকেশন লোড করা যায়নি।");
      setNotifications(Array.isArray(data.notifications) ? data.notifications as Notification[] : []);
      setUnreadCount(Number(data.unread_count ?? 0));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "নোটিফিকেশন লোড করা যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markRead(id: string) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch("/api/supreme/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "নোটিফিকেশন আপডেট করা যায়নি।");
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
      setUnreadCount((count) => Math.max(0, count - (data.updated > 0 ? 1 : 0)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "নোটিফিকেশন আপডেট করা যায়নি।");
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setError("");
    try {
      const response = await fetch("/api/supreme/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "নোটিফিকেশন আপডেট করা যায়নি।");
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
      setUnreadCount(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "নোটিফিকেশন আপডেট করা যায়নি।");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div>
          <p className="text-xs font-bold tracking-[.18em]" style={{ color: "var(--primary)" }}>SUPREME ALERT CENTER</p>
          <h2 className="mt-1 text-xl font-black">অভ্যন্তরীণ সতর্কতা</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>অর্ডার, পেমেন্ট, ডেলিভারি ও স্টকের গুরুত্বপূর্ণ ঘটনা।</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-2 text-xs font-extrabold" style={{ background: "color-mix(in srgb,var(--primary) 10%,var(--surface))", color: "var(--primary)" }}>অপঠিত {unreadCount.toLocaleString("bn-BD")}</span>
          <button type="button" onClick={() => void load()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border" style={{ borderColor: "var(--border)" }} aria-label="Refresh notifications"><Icon name="refresh" size={17} /></button>
        </div>
        <div className="flex w-full justify-end">
          <button type="button" onClick={() => void markAllRead()} disabled={markingAll || unreadCount === 0} className="rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-45" style={{ background: "var(--primary)", color: "#fff" }}>{markingAll ? "আপডেট হচ্ছে…" : "সবগুলো পড়া হয়েছে চিহ্নিত করুন"}</button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border p-4 text-sm text-red-500" style={{ borderColor: "rgba(220,38,38,.3)" }}>{error}</p>}

      {loading ? (
        <div className="rounded-2xl border p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>নোটিফিকেশন লোড হচ্ছে…</div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border px-5 py-14 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb,var(--primary) 10%,var(--surface))", color: "var(--primary)" }}><Icon name="bell" size={25} /></span>
          <h3 className="mt-4 text-lg font-black">এখনো কোনো সতর্কতা নেই</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>নতুন গুরুত্বপূর্ণ ঘটনা ঘটলে এখানে দেখা যাবে।</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <article key={item.id} className="rounded-2xl border p-4 transition sm:p-5" style={{ borderColor: item.read_at ? "var(--border)" : "color-mix(in srgb,var(--primary) 32%,var(--border))", background: item.read_at ? "var(--surface)" : "color-mix(in srgb,var(--primary) 4%,var(--surface))" }}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: "color-mix(in srgb,var(--primary) 10%,var(--surface))", color: "var(--primary)" }}><Icon name={categoryIcon(item.category)} size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-extrabold">{item.title}</strong>
                    {!item.read_at && <span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} aria-label="অপঠিত" />}
                  </div>
                  <p className="mt-1 text-sm leading-6" style={{ color: "var(--muted)" }}>{item.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full border px-2.5 py-1" style={severityStyle(item.severity)}>{severityLabels[item.severity]}</span>
                    <span className="rounded-full px-2.5 py-1" style={{ background: "var(--surface-soft)", color: "var(--muted)" }}>{categoryLabels[item.category]}</span>
                    <time style={{ color: "var(--muted)" }}>{new Date(item.created_at).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" })}</time>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link href={item.href} onClick={() => { if (!item.read_at) void markRead(item.id); }} className="inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: "var(--primary)" }}>সংশ্লিষ্ট পেজ খুলুন <Icon name="chevron-right" size={15} /></Link>
                    {!item.read_at && <button type="button" onClick={() => void markRead(item.id)} disabled={busyId === item.id} className="text-xs font-bold disabled:opacity-50" style={{ color: "var(--muted)" }}>{busyId === item.id ? "আপডেট হচ্ছে…" : "পড়া হয়েছে"}</button>}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-center text-xs" style={{ color: "var(--muted)" }}>সর্বশেষ ৫০টি সতর্কতা দেখানো হচ্ছে।</p>
      <div className="text-center"><Link href="/supreme" className="text-sm font-bold" style={{ color: "var(--primary)" }}>← Supreme Dashboard</Link></div>
    </section>
  );
}
