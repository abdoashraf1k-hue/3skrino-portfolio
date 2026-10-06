"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import HeroLogos from "@/components/sections/HeroLogos";
import SafeBoundary from "@/components/three/SafeBoundary";
import MidRoleCycler from "@/components/ui/MidRoleCycler";
import Timecode from "@/components/ui/Timecode";
import type { HeroFilter } from "@/data/hero-config";
import { site } from "@/data/site";
import { gsap } from "@/lib/gsap";
import {
  disposeAmbient,
  setAmbientAvailable,
  startAmbient,
  stopAmbient,
  useAmbientMuted,
} from "@/lib/hero-ambient";
import { T } from "@/lib/brand";
import { useHeroConfig, useSiteConfig } from "@/lib/live-config";
import { RICH_MOTION_QUERY, useInView, useMediaQuery } from "@/lib/hooks";
import { CONTAINER, cn, EASE_OUT } from "@/lib/utils";

// three.js + R3F only ever load on desktop, never on the server.
const ParticleName = dynamic(() => import("@/components/three/ParticleName"), { ssr: false });
const HeroScene = dynamic(() => import("@/components/three/HeroScene"), { ssr: false });

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: EASE_OUT },
});

const vh = () => (typeof window === "undefined" ? 1000 : window.innerHeight);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Cinematic bars leave once the page has scrolled this fraction of a viewport. */
const BARS_OUT_AT = 0.2;
const AMBIENT_EVENTS = ["pointerdown", "keydown", "touchstart", "mousemove"] as const;

/**
 * Hero ambient loop: advertises itself to the nav's mute button, then starts
 * on the first interaction the browser accepts as a gesture, fading out while
 * muted or scrolled away.
 */
function useHeroAmbient(enabled: boolean, src: string, inView: boolean) {
  const muted = useAmbientMuted();

  useEffect(() => {
    if (!enabled) return;
    setAmbientAvailable(true);
    return () => {
      setAmbientAvailable(false);
      disposeAmbient();
    };
  }, [enabled, src]);

  useEffect(() => {
    if (!enabled) return;
    if (muted || !inView) {
      stopAmbient();
      return;
    }
    let done = false;
    let busy = false;
    const detach = () => {
      for (const ev of AMBIENT_EVENTS) window.removeEventListener(ev, attempt);
    };
    function attempt() {
      if (done || busy) return;
      // Before any gesture an AudioContext can't start — don't even build one.
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      busy = true;
      void startAmbient(src).then((ok) => {
        busy = false;
        if (ok) {
          done = true;
          detach();
        }
      });
    }
    for (const ev of AMBIENT_EVENTS) window.addEventListener(ev, attempt, { passive: true });
    attempt(); // already interacted (un-muting, scrolling back up) → resume at once
    return () => {
      done = true;
      detach();
    };
  }, [enabled, src, muted, inView]);
}

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const config = useHeroConfig();
  const { content } = useSiteConfig();
  const { features } = config;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const wordRef = useRef<HTMLDivElement>(null);
  const underlineRef = useRef<HTMLSpanElement>(null);

  // Particles: desktop (≥768px) with motion allowed, and WebGL didn't fail.
  const rich = useMediaQuery(RICH_MOTION_QUERY);
  const [failed, setFailed] = useState(false);
  const particles = rich && !failed;
  // The neon-grid / silhouette backdrop has its own failure flag — losing one
  // WebGL layer shouldn't take the other down.
  const [sceneFailed, setSceneFailed] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const scene = rich && !sceneFailed;

  const { scrollY } = useScroll();
  // Pinned (particle) mode: copy lifts away as the name scatters.
  const pinnedY = useTransform(scrollY, (v) => -clamp01((v / vh() - 0.15) / 0.35) * 80);
  const pinnedOpacity = useTransform(scrollY, (v) => 1 - clamp01((v / vh() - 0.15) / 0.3));
  // Plain mode: the original subtle parallax (max 100px).
  const plainY = useTransform(scrollY, (v) => Math.min(v, vh()) * 0.1);
  const plainOpacity = useTransform(scrollY, (v) => 1 - clamp01(v / vh()) * 0.8);
  // Backdrop dims (not out) behind "VIDEO / EDITOR".
  const sceneOpacity = useTransform(scrollY, (v) => 1 - clamp01((v / vh() - 0.3) / 0.6) * 0.75);

  // Cinematic bars: slide in just after load, out past 20% scroll.
  const [loaded, setLoaded] = useState(false);
  const [scrolledPast, setScrolledPast] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setScrolledPast(window.scrollY > vh() * BARS_OUT_AT); // restored scroll position
      setLoaded(true);
    }, 150);
    return () => window.clearTimeout(id);
  }, []);
  useMotionValueEvent(scrollY, "change", (v) => setScrolledPast(v > vh() * BARS_OUT_AT));
  const barsIn = features.cinematicBars && loaded && !scrolledPast;

  const heroInView = useInView(sectionRef, { once: false, rootMargin: "0px" });
  useHeroAmbient(features.ambientSound, config.ambientSrc, heroInView);

  const logos = config.logos.enabled ? config.logos.items.filter((l) => l.visible) : [];

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

        {/* Static backdrop: mobile, reduced motion, no WebGL — and underneath
            the live scene until its first frame lands, so there's no flash. */}
        {!(scene && sceneReady) && <HeroFallback filter={features.filter} />}

        {scene && (
          <motion.div aria-hidden style={{ opacity: sceneOpacity }} className="pointer-events-none absolute inset-0">
            <div className={cn("absolute inset-0 transition-opacity duration-1000", sceneReady ? "opacity-100" : "opacity-0")}>
              <SafeBoundary onError={() => setSceneFailed(true)}>
                <HeroScene config={config} onReady={() => setSceneReady(true)} />
              </SafeBoundary>
            </div>
            {/* Soft scrim so the tagline + CTAs stay legible over the face and grid */}
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(38% 26% at 50% 66%, rgb(10 10 10 / 0.6), transparent 100%)" }}
            />
          </motion.div>
        )}

        {particles && (
          <SafeBoundary onError={() => setFailed(true)}>
            <ParticleName targetRef={nameRef} />
          </SafeBoundary>
        )}

        {logos.length > 0 && (
          <motion.div
            style={{ opacity: particles ? pinnedOpacity : plainOpacity }}
            className="pointer-events-none absolute inset-0 z-20"
          >
            <HeroLogos logos={logos} reducedMotion={reducedMotion} scale={config.logos.scale} />
          </motion.div>
        )}

        {/* Cinematic letterbox: 6vh bars that slide in on load and out on scroll. */}
        {features.cinematicBars && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-[6vh] bg-black transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                barsIn ? "translate-y-0" : "-translate-y-full",
              )}
            />
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 h-[6vh] bg-black transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                barsIn ? "translate-y-0" : "translate-y-full",
              )}
            />
          </div>
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
            <T k="home.hero.kicker" />
            <span aria-hidden className="anim-nudge ml-1 text-accent">
              ↓
            </span>
          </motion.p>

          {/* On desktop the glyphs stay in the layout (and a11y tree) but render
              transparent — the particles are sampled from and drawn over them. */}
          <h1
            aria-label={site.name}
            className={cn(
              "type-display text-[clamp(4.5rem,17vw,18rem)] leading-[0.86]",
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
            {content.tagline}
          </motion.p>

          <motion.div
            {...fadeUp(lettersDone + 0.1)}
            className="mt-12 flex flex-wrap items-center justify-center gap-6"
          >
            <Link
              href="/vertical-cuts"
              data-track="cta"
              data-track-id="hero_view_work"
        data-magnetic
              className="border border-fg px-8 py-4 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300 hover:bg-fg hover:text-bg"
            >
              <T k="home.hero.ctaWork" />
            </Link>
            <Link
              href="/vertical-cuts?view=player"
              data-track="cta"
              data-track-id="hero_showreel"
              className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-fg"
            >
              <T k="home.hero.ctaReel" />
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
            {/* Cycles through the roles (admin → Roles) — the hero's hand-off line. */}
            <MidRoleCycler />
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

/**
 * No-WebGL stand-in for the hero scene: a CSS perspective grid and the
 * silhouette, with stacked drop-shadows tracing its alpha as a cheap rim light.
 */
/** The static backdrop's take on each grade (the live scene grades in a post pass). */
const FALLBACK_FILTER: Record<HeroFilter, string> = {
  none: "",
  warm: "sepia(0.25) saturate(1.2) hue-rotate(-8deg)",
  cool: "hue-rotate(12deg) saturate(0.9) brightness(1.03)",
  vintage: "sepia(0.55) contrast(0.9) brightness(0.95)",
  contrast: "contrast(1.35) saturate(1.2)",
};

function HeroFallback({ filter }: { filter: HeroFilter }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={FALLBACK_FILTER[filter] ? { filter: FALLBACK_FILTER[filter] } : undefined}
    >
      {/* Horizon haze */}
      <div
        className="absolute inset-x-0 top-[38%] h-[30%]"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgb(255 45 45 / 0.16), transparent 70%)" }}
      />
      {/* Neon floor */}
      <div className="absolute inset-x-0 bottom-0 h-[48%] overflow-hidden [perspective:420px]">
        <div
          className="absolute -inset-x-1/2 bottom-0 h-[160%] origin-bottom [transform:rotateX(62deg)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(231 254 85 / 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgb(231 254 85 / 0.45) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "linear-gradient(to top, black 10%, transparent 85%)",
            WebkitMaskImage: "linear-gradient(to top, black 10%, transparent 85%)",
          }}
        />
      </div>
      {/* Silhouette */}
      <div
        className="absolute bottom-0 left-1/2 aspect-square h-[78svh] max-w-[150vw] -translate-x-1/2 md:h-[92svh]"
        style={{
          maskImage: "linear-gradient(to top, transparent 0%, black 16%)",
          WebkitMaskImage: "linear-gradient(to top, transparent 0%, black 16%)",
        }}
      >
        <Image
          src="/hero/silhouette-900.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 768px) 92vh, 78vh"
          className="object-contain object-bottom"
          style={{
            filter:
              "brightness(0.82) drop-shadow(0 -1px 0 rgb(231 254 85 / 0.9)) drop-shadow(0 0 10px rgb(231 254 85 / 0.35)) drop-shadow(0 0 28px rgb(255 45 45 / 0.25))",
          }}
        />
      </div>
    </div>
  );
}
