import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type MarqueeProps = {
  items: string[];
  /** Seconds for one full loop — higher is slower. */
  speed?: number;
  direction?: "left" | "right";
  separator?: string;
  className?: string;
  itemClassName?: string;
};

/**
 * Seamless CSS marquee: the item list is rendered twice and the track
 * translates -50%, so the loop point is invisible.
 */
export default function Marquee({
  items,
  speed = 40,
  direction = "left",
  separator = "•",
  className,
  itemClassName,
}: MarqueeProps) {
  const style = {
    "--marquee-duration": `${speed}s`,
    "--marquee-direction": direction === "left" ? "normal" : "reverse",
  } as CSSProperties;

  const group = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((item) => (
        <li key={item} className={cn("flex shrink-0 items-center whitespace-nowrap", itemClassName)}>
          <span>{item}</span>
          <span className="px-6 text-muted md:px-10">{separator}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={cn("relative flex overflow-hidden", className)}>
      <div className="marquee-track flex w-max" style={style}>
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}
