import { site } from "@/data/site";
import { siteConfig } from "@/data/site-config";
import { socialCard, uploadedImage } from "@/lib/og";

export const alt = `${site.name} — ${site.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Same as Open Graph (uploaded image, else the card with an X-specific eyebrow). */
export default function TwitterImage() {
  const { ogImage } = siteConfig.content;
  return ogImage ? uploadedImage(ogImage, size.width, size.height) : socialCard({ eyebrow: "Video editor & content creator" });
}
