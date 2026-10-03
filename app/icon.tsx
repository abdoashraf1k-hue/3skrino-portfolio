import { siteConfig } from "@/data/site-config";
import { monogram, uploadedImage } from "@/lib/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: the uploaded one (admin → Content), else the "3" monogram in the accent on black. */
export default function Icon() {
  const { favicon } = siteConfig.content;
  return favicon ? uploadedImage(favicon, size.width, size.height) : monogram(size.width);
}
