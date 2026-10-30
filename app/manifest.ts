import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/supreme",
    name: "NEWEIX Supreme Control",
    short_name: "NEWEIX Supreme",
    description: "NEWEIX-এর Supreme-only business control application",
    start_url: "/supreme",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#080b09",
    theme_color: "#080b09",
    lang: "bn",
    icons: [
      { src: "/supreme-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/supreme-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
