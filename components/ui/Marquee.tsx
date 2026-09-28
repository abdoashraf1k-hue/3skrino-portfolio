"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type MarqueeItem = string | { label: string; icon?: string };

type MarqueeProps = {
  items: MarqueeItem[];
  /** Seconds for one full loop — higher is slower. */
  speed?: number;
  direction?: "left" | "right";
  separator?: string;
  separatorClassName?: string;
  /** Swap 900 ↔ 400 every 5s ("breathing typography"). */
  breathe?: boolean;
  className?: string;
  itemClassName?: string;
};

const BREATHE_MS = 5000;

/**
 * Seamless CSS marquee: the item list is rendered twice and the track
 * translates -50%, so the loop point is invisible. Hovering any word pauses
 * the loop and highlights that word.
 */
export default function Marquee({
  items,
  speed = 40,
  direction = "left",
  separator = "•",
  separatorClassName = "text-accent/40",
  breathe = false,
  className,
  itemClassName,
}: MarqueeProps) {
  const [heavy, setHeavy] = useState(true);

  useEffect(() => {
    if (!breathe) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setHeavy((h) => !h), BREATHE_MS);
    return () => window.clearInterval(id);
  }, [breathe]);

  const style = {
    "--marquee-duration": `${speed}s`,
    "--marquee-direction": direction === "left" ? "normal" : "reverse",
  } as CSSProperties;

  const group = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((item) => {
        const { label, icon } = typeof item === "string" ? { label: item, icon: undefined } : item;
        return (
          <li key={label} className="flex shrink-0 items-center whitespace-nowrap">
            <span
              data-hover
              className={cn(
                "marquee-word relative inline-flex items-center gap-[0.35em] transition-[color,transform,font-weight] duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-105 hover:text-accent hover:duration-300",
                breathe && (heavy ? "font-black" : "font-normal"),
                itemClassName,
              )}
            >
              {icon && (
                <span aria-hidden className="text-[0.6em] text-accent">
                  {icon}
                </span>
              )}
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
