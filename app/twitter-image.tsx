import { site } from "@/data/site";
import { socialCard } from "@/lib/og";

export const alt = `${site.name} — ${site.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Same card as Open Graph with an X-specific eyebrow. */
export default function TwitterImage() {
  return socialCard({ eyebrow: "Video editor & content creator" });
}
