"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import SafeBoundary from "@/components/three/SafeBoundary";
import type { GenesisPalette } from "@/data/hero-config";
import { site } from "@/data/site";
import { T } from "@/lib/brand";
import { useInView, useMediaQuery } from "@/lib/hooks";
import { useHeroConfig, useSiteConfig } from "@/lib/live-config";
import { sameOriginMedia } from "@/lib/media-url";
import { CONTAINER, cn } from "@/lib/utils";
import type { Pointer } from "./genesis/GenesisScene";
import OrbitalLogos from "./genesis/OrbitalLogos";
import ImageSequenceHero, { type SequenceState } from "./ImageSequenceHero";
import { HeroCtas } from "./shared";

// three.js + R3F load on the client only, after the DOM hero paints.
const GenesisScene = dynamic(() => import("./genesis/GenesisScene"), { ssr: false });

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * The palette as CSS variables (--g-*) for every DOM layer — the AI Theme
 * Prompt rewrites these and the shaders' uniforms at once — plus copy tokens
 * that stay legible on the stage colour.
 */
function paletteVars(p: GenesisPalette): CSSProperties {
  const dark = luminance(p.background) < 0.4;
  const fg = dark ? "#f5f5f5" : "#0a0a0a";
  const muted = dark ? "#8a8a8a" : "#555555";
  const line = dark ? "#2a2a2a" : "#d6d6d6";
  return {
    background: p.background,
    color: fg,
    ["--g-bg" as string]: p.background,
    ["--g-grid" as string]: p.grid,
    ["--g-glow" as string]: p.glow,
    ["--g-tint" as string]: p.tint,
    ["--g-accent" as string]: p.accent,
    ["--g-fg" as string]: fg,
    ["--fg" as string]: fg,
    ["--color-fg" as string]: fg,
    ["--muted" as string]: muted,
    ["--color-muted" as string]: muted,
    ["--line" as string]: line,
    ["--color-line" as string]: line,
    ["--accent" as string]: p.grid,
    ["--color-accent" as string]: p.grid,
  };
}

/**
 * Hologram: `screen` melts a black photo backdrop into the scene (black adds
 * nothing) while highlights glow; a slight contrast crush makes near-blacks
 * truly vanish, and a feathered ellipse hides the photo's square edge.
 */
const HOLOGRAM: CSSProperties = {
  mixBlendMode: "screen",
  filter: "contrast(1.12) brightness(1.06)",
  maskImage: "radial-gradient(ellipse 34% 52% at 50% 42%, #000 58%, transparent 100%)",
  WebkitMaskImage: "radial-gradient(ellipse 34% 52% at 50% 42%, #000 58%, transparent 100%)",
};
/** Cutout (transparent frames): solid head, neon rim from the alpha edge. */
const CUTOUT: CSSProperties = {
  filter: "drop-shadow(0 0 1.5px var(--g-glow)) drop-shadow(0 0 18px color-mix(in srgb, var(--g-glow) 45%, transparent))",
};

/** Ken Burns: a slow push-in with a drifting pan, mirrored forever. */
const KEN_BURNS = {
  on: { scale: [1, 1.05, 1.08], x: ["0%", "1.2%", "-1.4%"], y: ["0%", "-0.8%", "0.6%"] },
  off: { scale: 1, x: "0%", y: "0%" },
};

/**
 * Sprint 15 — "Genesis", the primary hero: a deep retro grid running into a
 * glowing horizon, a procedural GLSL backdrop (admin-selectable), your logo
 * glitching behind the head, and the 360° image sequence (model3d frames —
 * the same ones the AI angle engine fills in) as the glowing head at centre.
 * Brand logos orbit clear of the face and react to the cursor.
 *
 * Layers, back to front: WebGL (backdrop → grid → watermark) · head halo ·
 * the portrait Canvas 2D (rim glow) · scrim · logos · copy. The visual stage
 * takes the optional Ken Burns move; the copy stays put so it stays crisp.
 *
 * Fallbacks: no WebGL (or a scene error) → a CSS gradient, CSS perspective
 * grid and a CSS-glitched watermark; reduced motion → the shaders freeze on
 * one frame, no Ken Burns, no gravity.
 */
export default function GenesisHero() {
  const config = useHeroConfig();
  const { content } = useSiteConfig();
  const g = config.genesis;
  const sectionRef = useRef<HTMLElement>(null);
  const pointer = useRef<Pointer>({ x: 0, y: 0 });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const still = config.poses.ladder[Math.floor(config.poses.ladder.length / 2)]?.src ?? "/hero/silhouette-900.webp";

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

  // The shader's pointer: -1..1 across the hero (the scene damps it).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = sectionRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      pointer.current.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      pointer.current.y = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const logos = config.logos.enabled ? config.logos.items.filter((l) => l.visible) : [];
  const kenBurns = g.autoCamera && !reducedMotion;
  const showCss = !(scene && ready);
  // Sprint 15.5: in hologram mode, once WebGL and the sequence are both up, the shader draws the head.
  const [sequence, setSequence] = useState<SequenceState>({ ready: false, webgl: false, frames: null });
  const hologram = g.headMode === "hologram";
  // Frames that loaded without CORS can't be sampled by WebGL: those keep the CSS hologram.
  const glHead = hologram && scene && ready && sequence.ready && sequence.webgl;
  const holoSettings = useMemo(
    () => (hologram ? { fresnel: g.holoFresnel, scanlines: g.holoScanlines, aberration: g.holoAberration, grain: g.holoGrain } : null),
    [hologram, g.holoFresnel, g.holoScanlines, g.holoAberration, g.holoGrain],
  );
  const onContextLost = useCallback(() => setFailed(true), []);

  return (
    <section
      id="home"
      ref={sectionRef}
      className="relative h-svh min-h-[560px] touch-pan-y touch-pinch-zoom overflow-hidden select-none"
      style={paletteVars(g.palette)}
    >
      <motion.div
        className="absolute inset-0 origin-[50%_42%] will-change-transform"
        animate={kenBurns ? KEN_BURNS.on : KEN_BURNS.off}
        transition={kenBurns ? { duration: 26, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" } : { duration: 1.4, ease: "easeOut" }}
      >
        {/* CSS stage: before WebGL is up, without WebGL, or after a scene error. */}
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 transition-opacity duration-1000", showCss ? "opacity-100" : "opacity-0")}>
          <CssStage watermarkUrl={g.customWatermarkUrl} watermarkScale={g.watermarkScale} watermarkOpacity={g.watermarkOpacity} grid={g.grid} />
        </div>

        {scene && (
          <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}>
            <SafeBoundary onError={() => setFailed(true)}>
              <GenesisScene
                preset={g.background}
                palette={g.palette}
                grid={g.grid}
                watermark={{ url: g.customWatermarkUrl, text: site.name, glitch: g.watermarkGlitch, opacity: g.watermarkOpacity, scale: g.watermarkScale }}
                hologram={glHead ? holoSettings : null}
                hologramFrames={glHead ? sequence.frames : null}
                pointer={pointer}
                reducedMotion={reducedMotion}
                active={active}
                onReady={onReady}
                onContextLost={onContextLost}
              />
            </SafeBoundary>
          </div>
        )}

        {/* Halo behind the head */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(22% 30% at 50% 40%, color-mix(in srgb, var(--g-glow) 26%, transparent), transparent 70%), radial-gradient(40% 22% at 50% 62%, color-mix(in srgb, var(--g-accent) 12%, transparent), transparent 75%)",
          }}
        />

        {/* CSS hologram fallback only (no WebGL / no sequence yet): screen-blending can't hide what's behind, so a soft dark occluder puts the watermark behind the head. */}
        {hologram && !glHead && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 17% 30% at 50% 36%, color-mix(in srgb, var(--g-bg) 94%, transparent) 45%, transparent 100%)" }}
          />
        )}

        {/*
          The 360° sequence. Hologram + WebGL: it keeps scrubbing, but the GLSL hologram in the scene draws it (canvas hidden).
          Hologram without WebGL: the CSS screen-blend fallback. Cutout: solid, neon rim traced from its alpha.
        */}
        <div className="pointer-events-none absolute inset-0" style={glHead ? undefined : hologram ? HOLOGRAM : CUTOUT}>
          <ImageSequenceHero
            frames={config.model3d.sequenceImages}
            fallbackSrc={still}
            trackRef={sectionRef}
            reducedMotion={reducedMotion}
            coarse={coarse}
            calibrationOffset={g.calibrationOffset}
            matteBackdrop
            hideCanvas={glHead}
            onReadyChange={setSequence}
          />
        </div>

        {/* Legibility scrim behind the copy */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%]"
          style={{ background: "linear-gradient(to top, var(--g-bg) 6%, color-mix(in srgb, var(--g-bg) 55%, transparent) 45%, transparent)" }}
        />

        {logos.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <OrbitalLogos logos={logos} reducedMotion={reducedMotion} scale={config.logos.scale} gravity={g.gravity} strength={g.gravityStrength} />
          </div>
        )}
      </motion.div>

      <div className={cn(CONTAINER, "pointer-events-none relative z-10 flex h-full flex-col justify-end pb-10 md:pb-14")}>
        <h1 className="sr-only">{site.name}</h1>
        <p className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
          <span className="size-1.5 rounded-full" style={{ background: "var(--g-glow)", boxShadow: "0 0 10px var(--g-glow)" }} />
          <T k="home.hero.kicker" />
        </p>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <p className="max-w-xl text-lg leading-snug text-fg/85 md:text-2xl">{content.tagline}</p>
          <HeroCtas className="pointer-events-auto" />
        </div>
      </div>
    </section>
  );
}

/** No-WebGL stand-in: gradient sky, CSS perspective grid, and the watermark glitched in CSS. */
function CssStage({ watermarkUrl, watermarkScale, watermarkOpacity, grid }: { watermarkUrl: string; watermarkScale: number; watermarkOpacity: number; grid: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 38%, color-mix(in srgb, var(--g-tint) 22%, transparent), transparent 70%), radial-gradient(60% 20% at 50% 56%, color-mix(in srgb, var(--g-accent) 22%, transparent), transparent 70%), var(--g-bg)",
        }}
      />
      {grid && (
        <div className="absolute inset-x-0 bottom-0 h-[46%] overflow-hidden [perspective:420px]">
          <div
            className="absolute -inset-x-1/2 bottom-0 h-[160%] origin-bottom [transform:rotateX(62deg)]"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in srgb, var(--g-grid) 50%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--g-grid) 50%, transparent) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "linear-gradient(to top, black 10%, transparent 85%)",
              WebkitMaskImage: "linear-gradient(to top, black 10%, transparent 85%)",
            }}
          />
        </div>
      )}
      <div className="absolute inset-x-0 top-[36%] flex -translate-y-1/2 justify-center" style={{ opacity: watermarkOpacity }}>
        {watermarkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo on any host
          <img
            src={sameOriginMedia(watermarkUrl)}
            alt=""
            className="genesis-mark-css object-contain"
            style={{ width: `${Math.min(115, 50 * watermarkScale)}%`, maxHeight: `${Math.min(92, 32 * watermarkScale)}svh` }}
          />
        ) : (
          <span
            className="genesis-mark-css type-display leading-none"
            style={{ color: "var(--g-glow)", fontSize: `clamp(2rem, ${(11 * watermarkScale).toFixed(1)}vw, ${(12 * watermarkScale).toFixed(1)}rem)` }}
          >
            {site.name}
          </span>
        )}
      </div>
    </div>
  );
}
