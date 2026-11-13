import type { MetadataRoute } from "next";

const publicRoutes = [
  "",
  "/services",
  "/shop",
  "/ecosystem",
  "/business",
  "/about",
  "/updates",
  "/help",
  "/faq",
  "/contact",
  "/docs",
  "/legal",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/security",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return publicRoutes.map((route) => ({
    url: `https://www.neweix.com${route}`,
    lastModified,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/services" ? 0.9 : 0.6,
  }));
}
