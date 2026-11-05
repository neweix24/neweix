import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/supreme",
    name: "NEWEIX Supreme Control",
    short_name: "NEWEIX Control",
    description: "Secure Supreme-only NEWEIX business control workspace.",
    start_url: "/supreme",
    scope: "/supreme/",
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
