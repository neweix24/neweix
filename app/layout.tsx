import type { Metadata, Viewport } from "next";
import "./globals.css";
import CustomerThemeProvider from "@/components/customer-theme-provider";

const siteUrl = "https://neweix.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NEWEIX — স্মার্ট অনলাইন শপিং",
    template: "%s | NEWEIX",
  },
  description:
    "NEWEIX-এ পণ্য আবিষ্কার করুন, নিরাপদে অর্ডার করুন এবং আপনার অর্ডারের অগ্রগতি ট্র্যাক করুন।",
  applicationName: "NEWEIX",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "bn_BD",
    url: siteUrl,
    siteName: "NEWEIX",
    title: "NEWEIX — স্মার্ট অনলাইন শপিং",
    description: "সহজ অনলাইন কেনাকাটা ও অর্ডার ট্র্যাকিং।",
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
    <html lang="bn">
      <body>
        <CustomerThemeProvider />
        {children}
      </body>
    </html>
  );
}
