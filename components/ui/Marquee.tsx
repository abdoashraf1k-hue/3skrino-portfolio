import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type MarqueeProps = {
  items: string[];
  /** Seconds for one full loop — higher is slower. */
  speed?: number;
  direction?: "left" | "right";
  separator?: string;
  separatorClassName?: string;
  /** Italicise every second item (from md up) for an editorial rhythm. */
  alternateItalic?: boolean;
  className?: string;
  itemClassName?: string;
  /** Per-item look (admin → Roles: icon, weight, colour). */
  decorate?: (label: string) => { style?: CSSProperties; icon?: ReactNode };
};

/**
 * Seamless CSS marquee: the item list is rendered twice and the track
 * translates -50%, so the loop point is invisible. Hovering any word pauses
 * the loop; hover styling comes from `itemClassName`.
 */
export default function Marquee({
  items,
  speed = 40,
  direction = "left",
  separator = "•",
  separatorClassName = "text-accent/40",
  alternateItalic = false,
  className,
  itemClassName,
  decorate,
}: MarqueeProps) {
  const style = {
    "--marquee-duration": `${speed}s`,
    "--marquee-direction": direction === "left" ? "normal" : "reverse",
  } as CSSProperties;

  const group = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((label, i) => {
        const deco = decorate?.(label);
        return (
        <li key={label} className="flex shrink-0 items-center whitespace-nowrap">
          {deco?.icon && <span className="mr-3 inline-flex text-accent md:mr-4">{deco.icon}</span>}
          <span
            data-hover
            className={cn(
              "marquee-word transition-colors ease-out",
              alternateItalic && i % 2 === 1 && "md:italic",
              itemClassName,
            )}
            style={deco?.style}
          >
            {label}
          </span>
          <span aria-hidden className={cn("px-6 md:px-10", separatorClassName)}>
            {separator}
          </span>
        </li>
        );
      })}
    </ul>
  );

  return (
    <div className={cn("marquee relative flex overflow-hidden", className)}>
      <div className="marquee-track flex w-max" style={style}>
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}
