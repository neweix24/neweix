import type { Metadata, Viewport } from "next";
import "./globals.css";
import CustomerThemeProvider from "@/components/customer-theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import GlobalLanguageControl from "@/components/global-language-control";

const siteUrl = "https://neweix.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NEWEIX — Smart Online Shopping",
    template: "%s | NEWEIX",
  },
  description:
    "Discover products, place secure orders, and track your deliveries with NEWEIX.",
  applicationName: "NEWEIX",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_BD",
    url: siteUrl,
    siteName: "NEWEIX",
    title: "NEWEIX — Smart Online Shopping",
    description: "A smarter way to shop online and track your orders.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080b09",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider><GlobalLanguageControl /><CustomerThemeProvider />
        {children}</LanguageProvider>
      </body>
    </html>
  );
}
