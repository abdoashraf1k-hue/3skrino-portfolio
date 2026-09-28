"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

const EDGES = ["0% 50%", "100% 50%", "50% 0%", "50% 100%", "0% 0%", "100% 0%", "0% 100%", "100% 100%"] as const;
const DUST_POOL = 6;

/**
 * Ambient film artefacts — rare and faint, never over the reading layer:
 *   light leak  every 15–30s, 300ms, ≤8% opacity, warm, from a random edge
 *   scratch     every 4–11s, 1px line, 50ms, 3% opacity
 *   dust        every 2–5s, 1–3 specks of 1–2px, ~90ms
 * Disabled for prefers-reduced-motion.
 */
export default function FilmArtifacts() {
  const leakRef = useRef<HTMLDivElement>(null);
  const scratchRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const leak = leakRef.current;
    const scratch = scratchRef.current;
    const dustRoot = dustRef.current;
    if (!leak || !scratch || !dustRoot) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers = new Set<number>();
    const schedule = (fn: () => void, min: number, max: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!document.hidden) fn();
        schedule(fn, min, max);
      }, rand(min, max));
      timers.add(id);
    };

    const flashLeak = () => {
      const at = pick(EDGES);
      leak.style.background = `radial-gradient(55% 65% at ${at}, rgba(255,150,60,1) 0%, rgba(255,90,40,0.5) 35%, transparent 70%)`;
      gsap.timeline()
        .to(leak, { opacity: rand(0.05, 0.08), duration: 0.1, ease: "power1.out" })
        .to(leak, { opacity: 0, duration: 0.2, ease: "power1.in" });
    };

    const flashScratch = () => {
      scratch.style.top = `${rand(5, 95)}%`;
      scratch.style.left = `${rand(0, 40)}%`;
      scratch.style.width = `${rand(20, 60)}%`;
      gsap.timeline().set(scratch, { opacity: 0.03 }).set(scratch, { opacity: 0 }, 0.05);
    };

    const specks = Array.from(dustRoot.children) as HTMLElement[];
    const flashDust = () => {
      const count = Math.ceil(rand(0, 3));
      for (let i = 0; i < count; i++) {
        const speck = specks[Math.floor(rand(0, specks.length))];
        const size = Math.random() < 0.7 ? 1 : 2;
        Object.assign(speck.style, { left: `${rand(0, 100)}%`, top: `${rand(0, 100)}%`, width: `${size}px`, height: `${size}px` });
        gsap.timeline().set(speck, { opacity: rand(0.15, 0.3) }).set(speck, { opacity: 0 }, rand(0.06, 0.12));
      }
    };

    schedule(flashLeak, 15000, 30000);
    schedule(flashScratch, 4000, 11000);
    schedule(flashDust, 2000, 5000);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      gsap.killTweensOf([leak, scratch, ...specks]);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[89] overflow-hidden">
      <div ref={leakRef} className="absolute inset-0 opacity-0 mix-blend-screen" />
      <div ref={scratchRef} className="absolute h-px bg-white opacity-0" />
      <div ref={dustRef}>
        {Array.from({ length: DUST_POOL }, (_, i) => (
          <span key={i} className="absolute rounded-full bg-white opacity-0" />
        ))}
      </div>
    </div>
  );
}
