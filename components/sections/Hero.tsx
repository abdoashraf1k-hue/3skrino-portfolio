"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SafeBoundary from "@/components/three/SafeBoundary";
import Timecode from "@/components/ui/Timecode";
import { site } from "@/data/site";
import { gsap } from "@/lib/gsap";
import { RICH_MOTION_QUERY, useMediaQuery } from "@/lib/hooks";
import { CONTAINER, cn, EASE_OUT } from "@/lib/utils";

// three.js + R3F only ever load on desktop, never on the server.
const ParticleName = dynamic(() => import("@/components/three/ParticleName"), { ssr: false });

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: EASE_OUT },
});

const vh = () => (typeof window === "undefined" ? 1000 : window.innerHeight);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const underlineRef = useRef<HTMLSpanElement>(null);

  // Particles: desktop (≥768px) with motion allowed, and WebGL didn't fail.
  const rich = useMediaQuery(RICH_MOTION_QUERY);
  const [failed, setFailed] = useState(false);
  const particles = rich && !failed;

  const { scrollY } = useScroll();
  // Pinned (particle) mode: copy lifts away as the name scatters.
  const pinnedY = useTransform(scrollY, (v) => -clamp01((v / vh() - 0.15) / 0.35) * 80);
  const pinnedOpacity = useTransform(scrollY, (v) => 1 - clamp01((v / vh() - 0.15) / 0.3));
  // Plain mode: the original subtle parallax (max 100px).
  const plainY = useTransform(scrollY, (v) => Math.min(v, vh()) * 0.1);
  const plainOpacity = useTransform(scrollY, (v) => 1 - clamp01(v / vh()) * 0.8);

  // "VIDEO / EDITOR" fades in as the particles leave.
  useEffect(() => {
    const el = wordRef.current;
    const section = sectionRef.current;
    if (!particles || !el || !section) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 60, letterSpacing: "0.08em" },
        {
          opacity: 1,
          y: 0,
          letterSpacing: "-0.02em",
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: () => `top+=${window.innerHeight * 0.55} top`,
            end: () => `top+=${window.innerHeight * 0.9} top`,
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );
    });
    return () => ctx.revert();
  }, [particles]);

  // Once the letters settle: a 2px accent line draws in under the name, then
  // breathes between 30% and 50% of its width (static at 40% for reduced motion).
  useEffect(() => {
    const el = underlineRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(el, { scaleX: 0.4 });
      return;
    }
    const tl = gsap
      .timeline({ delay: 2.5 })
      .fromTo(el, { scaleX: 0 }, { scaleX: 0.5, duration: 0.9, ease: "power3.out" })
      .to(el, { scaleX: 0.3, duration: 2.4, ease: "sine.inOut", repeat: -1, yoyo: true });
    return () => {
      tl.kill();
    };
  }, []);

  const letters = site.name.split("");
  const lettersDone = 0.2 + letters.length * 0.04;
  const hud = "font-mono text-[10px] uppercase tracking-widest text-muted";

  return (
    <section
      id="home"
      ref={sectionRef}
      // Desktop: a 200svh track with a pinned stage — the scatter plays while pinned.
      className={cn("relative", particles ? "h-[200svh]" : "min-h-svh")}
    >
      <div
        className={cn(
          "relative flex min-h-svh items-center overflow-hidden",
          particles && "sticky top-0 h-svh",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 45%, color-mix(in srgb, var(--accent) 3%, transparent) 0%, transparent 70%), linear-gradient(180deg, #0a0a0a 0%, #0d0d0d 50%, #0a0a0a 100%)",
          }}
        />

        {particles && (
          <SafeBoundary onError={() => setFailed(true)}>
            <ParticleName targetRef={nameRef} />
          </SafeBoundary>
        )}

        <motion.div
          style={{ y: particles ? pinnedY : plainY, opacity: particles ? pinnedOpacity : plainOpacity }}
          className={cn(CONTAINER, "relative z-10 flex flex-col items-center text-center")}
        >
          <motion.p
            {...fadeUp(0.1)}
            className="mb-8 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted"
          >
            <span className="size-1.5 rounded-full bg-accent" />
            Available for work — 2026
            <span aria-hidden className="anim-nudge ml-1 text-accent">
              ↓
            </span>
          </motion.p>

          {/* On desktop the glyphs stay in the layout (and a11y tree) but render
              transparent — the particles are sampled from and drawn over them. */}
          <h1
            aria-label={site.name}
            className={cn(
              "text-[clamp(4rem,15vw,16rem)] font-black uppercase leading-[0.9] tracking-tight",
              particles && "text-transparent",
            )}
          >
            <span ref={nameRef} data-text={site.name} className="relative inline-block">
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
              <span
                ref={underlineRef}
                aria-hidden
                className="absolute left-0 top-full mt-2 h-0.5 w-full origin-left scale-x-0 bg-accent"
              />
            </span>
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

        {particles && (
          <div
            ref={wordRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0"
          >
            <p className="text-center text-[clamp(3rem,10vw,10rem)] font-black uppercase leading-[0.9]">
              Video <span className="text-accent">/</span>
              <br />
              Editor
            </p>
          </div>
        )}

        {/* Camera HUD */}
        <motion.div
          {...fadeUp(lettersDone + 0.2)}
          className="pointer-events-none absolute inset-x-0 bottom-8 top-24 z-10"
        >
          <div className={cn(CONTAINER, "flex h-full flex-col justify-between")}>
            <div className={cn(hud, "flex justify-between")}>
              <span>F-Stop 1.4</span>
              <span>ISO 800</span>
            </div>
            <div className={cn(hud, "flex justify-between")}>
              <span>Scroll ↓</span>
              <span className="flex items-center gap-2 text-accent">
                <span className="size-1.5 animate-pulse rounded-full bg-accent-2" />
                <Timecode />
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
