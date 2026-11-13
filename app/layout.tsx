import type { Metadata, Viewport } from "next";
import "./globals.css";
import SiteShell from "@/components/site-shell";
export const metadata: Metadata = { title: { default: "Neweix — One Connected Ecosystem", template: "%s | Neweix" }, description: "Explore the Neweix digital ecosystem and its connected services.", applicationName: "Neweix" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07152f" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="bn" suppressHydrationWarning><body><SiteShell>{children}</SiteShell></body></html>; }
