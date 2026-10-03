import { site } from "@/data/site";
import { siteConfig } from "@/data/site-config";
import { socialCard, uploadedImage } from "@/lib/og";

export const alt = `${site.name} — ${site.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The uploaded share image (admin → Content), else the generated card. */
export default function OpengraphImage() {
  const { ogImage } = siteConfig.content;
  return ogImage ? uploadedImage(ogImage, size.width, size.height) : socialCard();
}
