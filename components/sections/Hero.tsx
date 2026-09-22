"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import Clock from "@/components/ui/Clock";
import { site } from "@/data/site";
import { CONTAINER, cn, EASE_OUT } from "@/lib/utils";

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: EASE_OUT },
});

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 100]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, reduce ? 1 : 0.2]);

  const letters = site.name.split("");
  const lettersDone = 0.2 + letters.length * 0.04;

  return (
    <section
      id="home"
      ref={ref}
      className="relative flex min-h-[110svh] items-center overflow-hidden"
    >
      {/* Faint accent glow from the centre — placeholder until a hero reel exists */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 45%, color-mix(in srgb, var(--accent) 3%, transparent) 0%, transparent 70%), linear-gradient(180deg, #0a0a0a 0%, #0d0d0d 50%, #0a0a0a 100%)",
        }}
      />

      <motion.div style={{ y, opacity }} className={cn(CONTAINER, "relative flex flex-col items-center text-center")}>
        <motion.p
          {...fadeUp(0.1)}
          className="mb-8 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted"
        >
          <span className="size-1.5 rounded-full bg-accent" />
          Available for work — 2026
        </motion.p>

        <h1
          aria-label={site.name}
          className="text-[clamp(4rem,15vw,16rem)] font-black uppercase leading-[0.9] tracking-tight"
        >
          {letters.map((char, i) => (
            <motion.span
              key={`${char}-${i}`}
              aria-hidden
              className="inline-block"
              initial={{ opacity: 0, y: "0.25em" }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.2 + i * 0.04, ease: EASE_OUT }}
            >
              {char}
            </motion.span>
          ))}
        </h1>

        <motion.p
          {...fadeUp(lettersDone)}
          className="mt-8 max-w-2xl text-xl leading-snug text-fg/80 md:text-[28px]"
        >
          Senior Video Editor &amp; Content Creator — 9+ years cutting brand films,
          commercials, social reels, and AI-driven visuals.
        </motion.p>

        <motion.div
          {...fadeUp(lettersDone + 0.1)}
          className="mt-12 flex flex-wrap items-center justify-center gap-6"
        >
          <Link
            href="/work"
            className="border border-fg px-8 py-4 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300 hover:bg-fg hover:text-bg"
          >
            View work
          </Link>
          <Link
            href="/reels"
            className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-fg"
          >
            Showreel
            <span className="inline-flex size-6 items-center justify-center rounded-full border border-line text-[8px] transition-colors duration-300 group-hover:border-accent group-hover:text-accent">
              ▶
            </span>
          </Link>
        </motion.div>
      </motion.div>

      <motion.div
        {...fadeUp(lettersDone + 0.2)}
        className="pointer-events-none absolute inset-x-0 bottom-8"
      >
        <div className={cn(CONTAINER, "flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted")}>
          <span>Scroll ↓</span>
          <span className="flex items-center gap-2">
            <span>{site.location}</span>
            <Clock className="tabular-nums" />
          </span>
        </div>
      </motion.div>
    </section>
  );
}
