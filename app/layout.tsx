import type { Metadata, Viewport } from "next";
import "./globals.css";
import SiteShell from "@/components/site-shell";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.neweix.com"),
  title: {
    default: "Neweix — One Connected Ecosystem",
    template: "%s | Neweix",
  },
  description:
    "Explore the Neweix digital ecosystem, discover its services, and find the latest public updates.",
  applicationName: "Neweix",
  openGraph: {
    type: "website",
    siteName: "Neweix",
    title: "Neweix — One Connected Ecosystem",
    description:
      "Explore the Neweix digital ecosystem and its connected services.",
    url: "https://www.neweix.com",
    locale: "bn_BD",
  },
  twitter: {
    card: "summary",
    title: "Neweix — One Connected Ecosystem",
    description:
      "Explore the Neweix digital ecosystem and its connected services.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07152f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
