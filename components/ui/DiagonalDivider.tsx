import { cn } from "@/lib/utils";

export type Tone = "base" | "soft";
const TONE: Record<Tone, string> = { base: "var(--bg)", soft: "var(--bg-soft)" };

/**
 * A ~3° diagonal seam between two sections (replaces the flat border): the
 * strip is the next section's colour with the previous one's clipped in as
 * a wedge, plus a hairline along the cut that catches an accent at one end.
 * `flip` alternates the slope so a long page zig-zags.
 */
export default function DiagonalDivider({ from, to, flip = false, className }: { from: Tone; to: Tone; flip?: boolean; className?: string }) {
  const y1 = flip ? 0 : 100;
  const y2 = flip ? 100 : 0;
  return (
    <div aria-hidden className={cn("relative h-[clamp(24px,5.2vw,96px)] w-full", className)} style={{ background: TONE[to] }}>
      <div
        className="absolute inset-0"
        style={{ background: TONE[from], clipPath: flip ? "polygon(0 0, 100% 0, 100% 100%)" : "polygon(0 0, 100% 0, 0 100%)" }}
      />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <line x1="0" y1={y1} x2="100" y2={y2} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {/* Accent catch: the first 14% of the cut. */}
        <line
          x1={flip ? 86 : 0}
          y1={flip ? 86 : 100}
          x2={flip ? 100 : 14}
          y2={flip ? 100 : 86}
          stroke="var(--accent)"
          strokeOpacity="0.55"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
