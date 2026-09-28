"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "@/lib/gsap";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Animate direct children one after another instead of the wrapper. */
  stagger?: boolean;
  /** Animate every [data-reveal-word] descendant, 0.04s apart (headlines). */
  words?: boolean;
  delay?: number;
  y?: number;
  duration?: number;
};

/** Scroll reveal: opacity 0 → 1, y → 0, triggered once on enter. */
export default function Reveal({
  children,
  className,
  stagger = false,
  words = false,
  delay = 0,
  y = 40,
  duration = 0.8,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const targets = words
        ? Array.from(el.querySelectorAll("[data-reveal-word]"))
        : stagger
          ? Array.from(el.children)
          : el;
      gsap.fromTo(
        targets,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration,
          ease: "reveal",
          delay,
          stagger: words ? 0.04 : stagger ? 0.08 : 0,
          // Hand transforms back to CSS so hover/active utilities keep working.
          clearProps: "transform",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [stagger, words, delay, y, duration]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
