import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/supreme/", "/staff/", "/api/"] },
    ],
    sitemap: "https://neweix.com/sitemap.xml",
    host: "https://neweix.com",
  };
}
