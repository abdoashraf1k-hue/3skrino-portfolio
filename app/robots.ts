import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // ?preview=1 is the admin's live-preview frame — never index it.
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/*?preview="] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
