"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/ui/icon";

type NotificationItem = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};

type NotificationResponse = {
  notifications?: NotificationItem[];
  unread_count?: number;
  error?: string;
};

function safeHref(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function NotificationInboxView() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/notifications", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const result = (await response.json().catch(() => null)) as NotificationResponse | null;
      if (!response.ok) {
        throw new Error(result?.error || (response.status === 401
          ? "Sign in to view your notifications."
          : "Could not load notifications."));
      }
      setItems(Array.isArray(result?.notifications) ? result.notifications : []);
      setUnreadCount(Number.isSafeInteger(result?.unread_count) ? Math.max(0, result?.unread_count ?? 0) : 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markRead(id: string) {
    const target = items.find((item) => item.id === id);
    if (!target || target.read_at || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not update this notification.");
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: readAt } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this notification.");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    if (unreadCount === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mark_all_read: true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not mark notifications as read.");
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
      setUnreadCount(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "linear-gradient(145deg,#fbfff7,#f3fff5 58%,#f5fbff)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/account" className="text-sm font-semibold" style={{ color: "var(--primary)" }}>← My account</Link>
            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Notifications</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Order, payment and delivery updates in one place.
              {unreadCount > 0 ? ` ${unreadCount} unread.` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void loadNotifications()} disabled={loading || busy} className="rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <Icon name="refresh" size={16} /> Refresh
            </button>
            <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0 || busy} className="rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--primary)", color: "#080b09" }}>
              Mark all read
            </button>
          </div>
        </header>

        {error && <p role="alert" className="mb-4 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--surface)" }}>{error}</p>}
        {loading ? <p role="status" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>Loading notifications…</p> :
          items.length === 0 ? <section className="rounded-2xl border p-10 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--surface-raised)", color: "var(--primary)" }}><Icon name="bell" size={26} /></span>
            <h2 className="mt-4 text-xl font-bold">You’re all caught up</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>New order, payment and delivery updates will appear here.</p>
            <Link href="/orders" className="mt-5 inline-flex rounded-xl px-5 py-3 text-sm font-bold" style={{ background: "var(--primary)", color: "#080b09" }}>View my orders</Link>
          </section> :
          <section className="overflow-hidden rounded-2xl border" aria-label="Notification list" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {items.map((item) => <article key={item.id} className="flex gap-3 border-b p-4 last:border-b-0 sm:p-5" style={{ borderColor: "var(--border)", background: item.read_at ? "transparent" : "var(--surface-raised)" }}>
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--surface)", color: "var(--primary)" }}><Icon name={item.event_type.toLowerCase().includes("deliver") ? "truck" : item.event_type.toLowerCase().includes("payment") ? "wallet" : "bell"} size={19} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold">{item.title}</h2>
                  {!item.read_at && <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--primary)", color: "#080b09" }}>New</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--muted)" }}>{item.body}</p>
                <time className="mt-2 block text-xs" style={{ color: "var(--muted)" }} dateTime={item.created_at}>{formatDate(item.created_at)}</time>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold">
                  <Link href={safeHref(item.href)} onClick={() => { if (!item.read_at) void markRead(item.id); }} style={{ color: "var(--primary)" }}>View details <Icon name="arrow-right" size={14} /></Link>
                  {!item.read_at && <button type="button" disabled={busy} onClick={() => void markRead(item.id)} className="disabled:opacity-50" style={{ color: "var(--muted)" }}>Mark as read</button>}
                </div>
              </div>
            </article>)}
          </section>}
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>Showing the latest 30 notifications.</p>
      </div>
    </main>
  );
}
