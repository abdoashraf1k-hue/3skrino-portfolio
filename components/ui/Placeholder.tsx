import Image from "next/image";
import { cn, skipImageOptimizer } from "@/lib/utils";

type PlaceholderProps = {
  title: string;
  /** Used to vary the gradient so cards don't look identical. */
  seed?: number;
  image?: string;
  className?: string;
  size?: "sm" | "lg";
  /** Tints the blur-up placeholder shown while `image` loads. */
  accent?: string;
  /** next/image `sizes` — defaults to a wide card. */
  sizes?: string;
};

/** A 1×1-ish SVG blur-up in the card's gradient + accent — inline, no fetch. */
function blurData(accent: string): `data:image/${string}` {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><defs><radialGradient id="g" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="${accent}" stop-opacity="0.35"/><stop offset="1" stop-color="#0a0a0a"/></radialGradient></defs><rect width="8" height="8" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const GRADIENTS = [
  "radial-gradient(120% 90% at 20% 10%, #262626 0%, #141414 45%, #0b0b0b 100%)",
  "radial-gradient(110% 100% at 85% 20%, #232323 0%, #121212 50%, #0a0a0a 100%)",
  "radial-gradient(120% 120% at 50% 100%, #242424 0%, #131313 45%, #0a0a0a 100%)",
  "linear-gradient(135deg, #1e1e1e 0%, #111111 55%, #0a0a0a 100%)",
  "radial-gradient(100% 90% at 10% 90%, #252525 0%, #121212 50%, #0b0b0b 100%)",
];

/**
 * Dark gradient stand-in for footage. Swap to a real still by passing `image`.
 */
export default function Placeholder({
  title,
  seed = 0,
  image,
  className,
  size = "lg",
  accent = "#262626",
  sizes = "(min-width: 1024px) 60vw, 100vw",
}: PlaceholderProps) {
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{ background: GRADIENTS[seed % GRADIENTS.length] }}
    >
      {image ? (
        <Image
          src={image}
          alt={title}
          fill
          sizes={sizes}
          unoptimized={skipImageOptimizer(image)}
          placeholder={blurData(accent)}
          className="object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center justify-center px-6 text-center type-display leading-none text-fg/[0.05]",
            size === "lg" ? "text-[clamp(2.5rem,7vw,7rem)]" : "text-4xl",
          )}
        >
          {title}
        </span>
      )}
    </div>
  );
}
