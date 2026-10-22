import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neweix | আপনার পছন্দের অনলাইন শপ",
  description:
    "Neweix থেকে সহজে পছন্দের পণ্য কিনুন। সারা বাংলাদেশে ডেলিভারি সুবিধা।",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn">
      <body className="min-h-screen bg-white antialiased">
        {children}
      </body>
    </html>
  );
}