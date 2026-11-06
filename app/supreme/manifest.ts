import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const privatePath = process.env.SUPREME_PRIVATE_PATH || "/supreme";
  return {
    id: privatePath,
    name: "NEWEIX Supreme Control",
    short_name: "NEWEIX Control",
    description: "Secure Supreme-only NEWEIX business control workspace.",
    start_url: privatePath,
    scope: privatePath,
    display: "standalone",
    orientation: "portrait",
    background_color: "#080b09",
    theme_color: "#080b09",
    lang: "en",
    icons: [
      { src: "/supreme-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/supreme-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
