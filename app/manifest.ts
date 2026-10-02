import type { MetadataRoute } from "next";
import { site } from "@/data/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — Video Editor`,
    short_name: site.name,
    description: `${site.role} — brand films, commercials, social reels and AI video.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#0a0a0a",
    background_color: "#0a0a0a",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Work", url: "/work" },
      { name: "Reels", url: "/reels" },
      { name: "Contact", url: "/contact" },
    ],
  };
}
