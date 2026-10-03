"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { gsap } from "@/lib/gsap";

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

/** Scroll reveal: opacity 0 → 1, y → 0, triggered once on enter. */
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
      gsap.fromTo(
        targets,
        { opacity: 0, y, ...(blur ? { filter: `blur(${blur}px)` } : {}) },
        {
          opacity: 1,
          y: 0,
          ...(blur ? { filter: "blur(0px)" } : {}),
          duration,
          ease: "reveal",
          delay,
          stagger: split ? each : stagger ? 0.08 : 0,
          // Hand transforms back to CSS so hover/active utilities keep working.
          clearProps: "transform,filter",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [stagger, split, each, blur, delay, y, duration]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
