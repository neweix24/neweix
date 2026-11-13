import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;

// Local Cloudflare bindings are only needed by the Next.js dev server.
// Avoid starting Wrangler's remote proxy during CI and production builds.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
