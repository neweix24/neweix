import type { Metadata } from "next";
import "./globals.css";
import CustomerThemeProvider from "@/components/customer-theme-provider";

export const metadata: Metadata = {
  title: "Neweix — স্মার্ট শপিং",
  description: "Neweix অনলাইন শপ",
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