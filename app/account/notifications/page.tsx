import type { Metadata } from "next";
import NotificationInboxView from "@/features/account/notification-inbox-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Notifications | NEWEIX",
  description: "Your NEWEIX order, payment and delivery notifications.",
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationInboxView />;
}
