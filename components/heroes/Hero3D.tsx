"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import HeroLogos from "@/components/sections/HeroLogos";
import SafeBoundary from "@/components/three/SafeBoundary";
import { site } from "@/data/site";
import { T } from "@/lib/brand";
import { useInView, useMediaQuery } from "@/lib/hooks";
import { useHeroConfig, useSiteConfig } from "@/lib/live-config";
import { CONTAINER, cn } from "@/lib/utils";
import { useHeroStore } from "@/store/heroStore";
import ImageSequenceHero from "./ImageSequenceHero";
import { HeroCtas } from "./shared";

// three.js, R3F and the post stack load on the client only, after the DOM hero paints.
const Hero3DScene = dynamic(() => import("@/components/heroes/Hero3DScene"), { ssr: false });

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** WCAG relative luminance of a #rrggbb colour (0 black … 1 white). */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * The stage paints its own background (admin → theme), whatever the site's
 * light / dark mode — so the copy on it takes matching tokens. Both layers
 * are set: Tailwind's --color-* resolve --fg at :root, not here.
 */
function stageTokens(background: string): CSSProperties {
  const dark = luminance(background) < 0.4;
  const fg = dark ? "#f5f5f5" : "#0a0a0a";
  const muted = dark ? "#8a8a8a" : "#555555";
  const line = dark ? "#2a2a2a" : "#d6d6d6";
  return { background, color: fg, ["--fg" as string]: fg, ["--color-fg" as string]: fg, ["--muted" as string]: muted, ["--color-muted" as string]: muted, ["--line" as string]: line, ["--color-line" as string]: line };
}

/**
 * Sprint 13 — the "3D model" hero (admin → Heroes → 3D model), now a 360°
 * photo turn: your own image sequence scrubbed by the mouse (or a horizontal
 * drag on touch) on a Canvas 2D, with the WebGL orbit — the school of glowing
 * fish — circling behind it and turning with it, and the brand ring floating
 * on top (logos with projects open /reels?brand=<id>). Without a sequence the
 * centre pose stands in as a still.
 *
 * Interaction never traps the page: there is no zoom, and on touch screens
 * only horizontal drags turn the head (`touch-action: pan-y`), so vertical
 * swipes always scroll.
 */
export default function Hero3D() {
  const config = useHeroConfig();
  const { content } = useSiteConfig();
  const model3d = config.model3d;
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const still = config.poses.ladder[Math.floor(config.poses.ladder.length / 2)]?.src ?? "/hero/silhouette-900.webp";

  // Hydrate before the first scene render (no subscribers yet), then on every config change.
  useState(() => useHeroStore.getState().hydrate(model3d));
  useEffect(() => {
    useHeroStore.getState().hydrate(model3d);
  }, [model3d]);

  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setWebgl(hasWebGL()));
    return () => cancelAnimationFrame(id);
  }, []);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const scene = webgl === true && !failed;

  const active = useInView(sectionRef, { once: false, rootMargin: "100px" });

  const logos = config.logos.enabled ? config.logos.items.filter((l) => l.visible) : [];
  const bg = model3d.theme.background;

  return (
    <section
      id="home"
      ref={sectionRef}
      className="relative h-svh min-h-[560px] touch-pan-y touch-pinch-zoom overflow-hidden select-none"
      style={stageTokens(bg)}
    >
      {/* Static stage: before WebGL is up, without WebGL, or if the scene fails. */}
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 transition-opacity duration-1000", scene && ready ? "opacity-0" : "opacity-100")}
        style={{
          background: `radial-gradient(42% 46% at 50% 42%, color-mix(in srgb, ${model3d.theme.primary} 16%, transparent), transparent 70%), radial-gradient(30% 30% at 38% 30%, color-mix(in srgb, ${model3d.theme.secondary} 12%, transparent), transparent 70%)`,
        }}
      />

      {scene && (
        <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}>
          <SafeBoundary onError={() => setFailed(true)}>
            <Hero3DScene reducedMotion={reducedMotion} active={active} onReady={onReady} />
          </SafeBoundary>
        </div>
      )}

      {/* The portrait: a Canvas 2D on top of the WebGL orbit (or of the static stage without WebGL). */}
      <ImageSequenceHero frames={model3d.sequenceImages} fallbackSrc={still} trackRef={sectionRef} reducedMotion={reducedMotion} coarse={coarse} />

      {/* Legibility scrim behind the copy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%]"
        style={{ background: `linear-gradient(to top, ${bg} 8%, color-mix(in srgb, ${bg} 55%, transparent) 45%, transparent)` }}
      />

      {logos.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <HeroLogos logos={logos} reducedMotion={reducedMotion} scale={config.logos.scale} />
        </div>
      )}

      <div className={cn(CONTAINER, "pointer-events-none relative z-10 flex h-full flex-col justify-end pb-10 md:pb-14")}>
        <p className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          <T k="home.hero.kicker" />
        </p>
        <h1 className="type-display text-[clamp(3.5rem,13vw,13rem)] leading-[0.86]">{site.name}</h1>
        <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <p className="max-w-xl text-lg leading-snug text-fg/80 md:text-2xl">{content.tagline}</p>
          <HeroCtas className="pointer-events-auto" />
        </div>
      </div>

    </section>
  );
}
