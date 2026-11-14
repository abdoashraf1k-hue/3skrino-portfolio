"use client";

import { usePathname } from "next/navigation";
import { site } from "@/data/site";
import { useHeroConfig } from "@/lib/live-config";
import { sameOriginMedia } from "@/lib/media-url";

/**
 * Sprint 15.5 — the photographer's signature: a small, semi-transparent copy
 * of the custom watermark (admin → Poses → Genesis → Global watermark) in the
 * bottom-right corner of every page, beside the scroll-to-top button. The
 * same customWatermarkUrl as the hero; without a logo it signs with the
 * site name. Never on the admin, never clickable, out of the a11y tree.
 */
export default function GlobalWatermark() {
  const { genesis } = useHeroConfig();
  const pathname = usePathname();
  if (!genesis?.globalWatermark || pathname?.startsWith("/admin")) return null;

  const opacity = Math.min(0.6, Math.max(0.15, genesis.watermarkOpacity * 0.45));
  const glow = genesis.palette.glow;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-6 right-20 z-40 select-none md:bottom-9 md:right-24"
      style={{ opacity, filter: `drop-shadow(0 0 6px color-mix(in srgb, ${glow} 55%, transparent))` }}
    >
      {genesis.customWatermarkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo on any host
        <img src={sameOriginMedia(genesis.customWatermarkUrl)} alt="" draggable={false} className="h-7 w-auto max-w-32 object-contain md:h-9 md:max-w-40" />
      ) : (
        <span className="type-display text-lg leading-none text-fg md:text-xl">{site.name}</span>
      )}
    </div>
  );
}
