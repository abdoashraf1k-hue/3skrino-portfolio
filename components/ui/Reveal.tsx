"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useSectionInfo } from "@/components/ui/SectionContext";
import { DEFAULT_EASING } from "@/data/cinematic-defaults";
import { useCinematic } from "@/lib/cinematic";
import { parseEasing } from "@/lib/easing";
import { CustomEase, gsap } from "@/lib/gsap";

/** A GSAP ease for a CSS easing (admin → Motion Lab); the stock one stays the registered "reveal". */
function easeFor(css: string): string {
  if (css === DEFAULT_EASING) return "reveal";
  const p = parseEasing(css);
  if (!p) return "reveal";
  const name = `motion-${p.map((n) => String(n).replace(/[^\d]/g, "_")).join("-")}`;
  if (!CustomEase.get(name)) CustomEase.create(name, p.join(","));
  return name;
}

type RevealProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Animate direct children one after another instead of the wrapper. */
  stagger?: boolean;
  /** Animate every [data-reveal-split] descendant (words/letters), `each` seconds apart. */
  split?: boolean;
  /** Stagger between split pieces. */
  each?: number;
  /** Start blurred by this many px and sharpen in. */
  blur?: number;
  delay?: number;
  y?: number;
  duration?: number;
};

/**
 * Scroll reveal, triggered once on enter. The entry style (fade / slide /
 * scale / blur), easing and speed come from admin → Motion Lab, with
 * per-section overrides from admin → Sections; "slide" is the original
 * opacity 0 → 1, y → 0.
 */
export default function Reveal({
  children,
  className,
  style,
  stagger = false,
  split = false,
  each = 0.03,
  blur = 0,
  delay = 0,
  y = 40,
  duration = 0.7,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { motion, sections } = useCinematic();
  const sectionId = useSectionInfo()?.id;
  const entry = (sectionId && sections[sectionId]?.entry) || motion.entry;
  const easing = motion.easing;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const targets = split
        ? Array.from(el.querySelectorAll("[data-reveal-split]"))
        : stagger
          ? Array.from(el.children)
          : el;
      const startBlur = entry === "blur" ? Math.max(blur, 12) : blur;
      gsap.fromTo(
        targets,
        {
          opacity: 0,
          y: entry === "slide" ? y : entry === "blur" ? y * 0.25 : 0,
          ...(entry === "scale" ? { scale: 0.92 } : {}),
          ...(startBlur ? { filter: `blur(${startBlur}px)` } : {}),
        },
        {
          opacity: 1,
          y: 0,
          ...(entry === "scale" ? { scale: 1 } : {}),
          ...(startBlur ? { filter: "blur(0px)" } : {}),
          // Speed is applied by the global GSAP timescale (Motion Lab) — not twice here.
          duration,
          ease: easeFor(easing),
          delay,
          stagger: split ? each : stagger ? 0.08 : 0,
          // Hand transforms back to CSS so hover/active utilities keep working.
          clearProps: "transform,filter",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [stagger, split, each, blur, delay, y, duration, entry, easing]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
