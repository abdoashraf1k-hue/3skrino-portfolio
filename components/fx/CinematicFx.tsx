"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ASPECT_VALUE } from "@/data/cinematic-defaults";
import type { AspectRatio, LutPreset, SoundName } from "@/data/site-config";
import {
  effectOn,
  refreshViewport,
  ruleActive,
  scopeOf,
  useCinematic,
  useEffectActive,
  useFxEvent,
  useScrollVelocity,
  useUiSoundRequests,
  useViewport,
} from "@/lib/cinematic";
import { gsap } from "@/lib/gsap";
import { useMediaQuery } from "@/lib/hooks";
import { getLenis } from "@/lib/scroll";
import { LutDefs, lutFilter } from "./lut";
import { readSoundPref } from "@/lib/sound";
import { playUiSound } from "@/lib/ui-sound";

/**
 * The cinematic toolbox, rendered once in the root layout (admin → Effects,
 * Experiment Lab, Sections, Sound Studio, Motion Lab). Each effect is its own
 * component that renders nothing — and attaches no listener — unless it's on
 * and its scope covers what's on screen. Never mounts in the admin.
 */
export default function CinematicFx() {
  const pathname = usePathname();
  // Sections change per route: re-measure which one is centred.
  useEffect(() => refreshViewport(), [pathname]);
  if (pathname.startsWith("/admin")) return null;
  return (
    <>
      <TextFx />
      <MediaGrade />
      <VhsFx />
      <CrtFx />
      <LightLeaksFx />
      <GlitchFx />
      <BarsFx />
      <LetterboxFx />
      <DofFx />
      <MotionBlurFx />
      <CameraShakeFx />
      <TimeRemapFx />
      <FilmScratchFx />
      <TransitionFx />
      <SoundFx />
      <MotionFx />
    </>
  );
}

const useReduced = () => useMediaQuery("(prefers-reduced-motion: reduce)");
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Elements an effect may move. Never <main> itself: a transform there would re-anchor any position:fixed content inside. */
function movableTargets(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("main #home, main [data-fx-section]")).filter((el) => !el.querySelector(".pin-spacer"));
}

/* ------------------------------------------------------------------ */
/* 2 · Chromatic aberration (text) + 3 · VHS colour bleeding           */
/* ------------------------------------------------------------------ */
function TextFx() {
  const c = useCinematic();
  const ca = useEffectActive("chromatic");
  const vhs = useEffectActive("vhs");
  const reduced = useReduced();
  const { strength, breathing } = c.effects.chromatic;
  const bleeding = c.effects.vhs.bleeding;

  useEffect(() => {
    const root = document.documentElement;
    const bleed = vhs && bleeding > 0;
    root.classList.toggle("fx-text-ca", ca);
    root.classList.toggle("fx-ca-breathe", ca && breathing && !reduced);
    root.classList.toggle("fx-text-bleed", bleed);
    if (ca) {
      root.style.setProperty("--fx-ca", `${(0.4 + strength * 4.6).toFixed(2)}px`);
      root.style.setProperty("--fx-ca-a", "0.55");
    }
    if (bleed) {
      root.style.setProperty("--fx-bleed", `${(bleeding * 3).toFixed(2)}px`);
      root.style.setProperty("--fx-bleed-a", (0.2 + bleeding * 0.4).toFixed(2));
    }
    return () => {
      root.classList.remove("fx-text-ca", "fx-ca-breathe", "fx-text-bleed");
      for (const p of ["--fx-ca", "--fx-ca-a", "--fx-bleed", "--fx-bleed-a"]) root.style.removeProperty(p);
    };
  }, [ca, vhs, strength, breathing, bleeding, reduced]);

  return null;
}

/* ------------------------------------------------------------------ */
/* 9 · LUTs · 13 · Halation · 14 · Bloom (+ chromatic fringe on media) */
/* ------------------------------------------------------------------ */
const SAFE_ID = /^[a-z0-9-]+$/;
const MEDIA = ":is(img, video):not([data-fx-skip])";

function MediaGrade() {
  const c = useCinematic();
  const lut = useEffectActive("lut");
  const bloom = useEffectActive("bloom");
  const halation = useEffectActive("halation");
  const ca = useEffectActive("chromatic");
  const { effects } = c;

  const extras = [
    bloom ? "url(#fx-bloom)" : "",
    halation ? "url(#fx-halation)" : "",
    ca ? `drop-shadow(${-(effects.chromatic.strength * 3).toFixed(1)}px 0 0 rgb(255 0 60 / 0.35)) drop-shadow(${(effects.chromatic.strength * 3).toFixed(1)}px 0 0 rgb(0 220 255 / 0.35))` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const chain = (preset: LutPreset) => [lutFilter(preset), extras].filter(Boolean).join(" ") || "none";

  const rules: string[] = [];
  const globalPreset: LutPreset = lut ? effects.lut.preset : "none";
  if (globalPreset !== "none" || extras) rules.push(`main ${MEDIA}{filter:${chain(globalPreset)}}`);
  for (const [id, fx] of Object.entries(c.sections)) {
    if (fx?.lut && SAFE_ID.test(id)) rules.push(`main [data-fx-section="${id}"] ${MEDIA}{filter:${chain(fx.lut)}}`);
  }
  for (const [id, preset] of Object.entries(c.lutProjects)) {
    if (SAFE_ID.test(id)) rules.push(`[data-lut-project="${id}"] ${MEDIA}{filter:${chain(preset)}}`);
  }
  if (!rules.length) return null;

  const { threshold, intensity } = effects.bloom;
  const k = 1 / Math.max(0.05, 1 - threshold);
  const hal = effects.halation.strength;
  const used = new Set<LutPreset>([globalPreset, ...Object.values(c.sections).map((s) => s?.lut ?? "none"), ...Object.values(c.lutProjects)]);

  return (
    <>
      <LutDefs presets={used} />
      <svg aria-hidden width="0" height="0" className="pointer-events-none absolute" style={{ position: "absolute" }}>
        <defs>
          {bloom && (
            <filter id="fx-bloom" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
              <feComponentTransfer in="SourceGraphic" result="bright">
                <feFuncR type="linear" slope={k} intercept={-k * threshold} />
                <feFuncG type="linear" slope={k} intercept={-k * threshold} />
                <feFuncB type="linear" slope={k} intercept={-k * threshold} />
              </feComponentTransfer>
              <feGaussianBlur in="bright" stdDeviation={4 + intensity * 12} result="soft" />
              <feComponentTransfer in="soft" result="glow">
                <feFuncR type="linear" slope={intensity * 1.6} />
                <feFuncG type="linear" slope={intensity * 1.6} />
                <feFuncB type="linear" slope={intensity * 1.6} />
              </feComponentTransfer>
              <feBlend in="SourceGraphic" in2="glow" mode="screen" />
            </filter>
          )}
          {halation && (
            // Film halation: light bleeding back through the base — a red-orange fringe around highlights.
            <filter id="fx-halation" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
              <feColorMatrix in="SourceGraphic" type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" result="luma" />
              <feComponentTransfer in="luma" result="hot">
                <feFuncR type="linear" slope="4" intercept="-2.8" />
                <feFuncG type="linear" slope="4" intercept="-2.8" />
                <feFuncB type="linear" slope="4" intercept="-2.8" />
              </feComponentTransfer>
              <feGaussianBlur in="hot" stdDeviation={2 + hal * 7} result="spread" />
              <feColorMatrix in="spread" type="matrix" values={`${hal * 1.4} 0 0 0 0  ${hal * 0.32} 0 0 0 0  ${hal * 0.1} 0 0 0 0  0 0 0 1 0`} result="tint" />
              <feBlend in="SourceGraphic" in2="tint" mode="screen" />
            </filter>
          )}
        </defs>
      </svg>
      <style data-fx="grade" dangerouslySetInnerHTML={{ __html: rules.join("") }} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · VHS — scanlines + rolling tracking band (bleeding: TextFx)      */
/* ------------------------------------------------------------------ */
function VhsFx() {
  const active = useEffectActive("vhs");
  const { scanlines, tracking } = useCinematic().effects.vhs;
  if (!active) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[88] overflow-hidden">
      <div className="fx-vhs-jitter absolute inset-0">
        <div className="fx-vhs-scan absolute inset-0" style={{ "--fx-scan": (scanlines * 0.45).toFixed(2) } as CSSProperties} />
      </div>
      {tracking > 0 && <div className="fx-vhs-track absolute inset-x-0 top-0" style={{ opacity: tracking }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 · CRT — global overlay; per section through [data-fx-crt]         */
/* ------------------------------------------------------------------ */
function CrtFx() {
  const active = useEffectActive("crt");
  const { curve, glow, trails } = useCinematic().effects.crt;

  // Section CRTs (admin → Sections) read the same tuning.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--crt-curve", String(curve));
    root.style.setProperty("--crt-glow", String(glow));
    root.style.setProperty("--crt-trails", String(trails));
    return () => {
      for (const p of ["--crt-curve", "--crt-glow", "--crt-trails"]) root.style.removeProperty(p);
    };
  }, [curve, glow, trails]);

  if (!active) return null;
  return <div aria-hidden className="fx-crt fixed inset-0 z-[88]" />;
}

/* ------------------------------------------------------------------ */
/* 6 · Light leaks — ambient drift + bursts over interactive things    */
/* ------------------------------------------------------------------ */
const LEAKS = [
  { at: "8% 12%", color: "255 122 47", size: "62vmax" },
  { at: "92% 30%", color: "255 61 110", size: "48vmax" },
  { at: "60% 96%", color: "255 179 71", size: "55vmax" },
];

function LightLeaksFx() {
  const active = useEffectActive("lightLeaks");
  const { ambient, hover } = useCinematic().effects.lightLeaks;
  const reduced = useReduced();
  const [levels, setLevels] = useState([0.35, 0.25, 0.3]);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const nextId = useRef(0);

  // Random flicker: each leak picks a new brightness every 1.2–3s.
  useEffect(() => {
    if (!active || !ambient || reduced) return;
    let id = 0;
    const step = () => {
      setLevels(LEAKS.map(() => rand(0.12, 0.5)));
      id = window.setTimeout(step, rand(1200, 3000));
    };
    step();
    return () => window.clearTimeout(id);
  }, [active, ambient, reduced]);

  useEffect(() => {
    if (!active || !hover) return;
    let last: Element | null = null;
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest("a, button, [data-hover]") ?? null;
      if (!el || el === last) {
        last = el;
        return;
      }
      last = el;
      const id = nextId.current++;
      setBursts((b) => [...b.slice(-3), { id, x: e.clientX, y: e.clientY }]);
      window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1100);
    };
    document.addEventListener("mouseover", onOver);
    return () => document.removeEventListener("mouseover", onOver);
  }, [active, hover]);

  if (!active) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[87] overflow-hidden">
      {ambient &&
        LEAKS.map((l, i) => (
          <div
            key={i}
            className="fx-leak absolute inset-[-20%]"
            style={{
              opacity: levels[i],
              animationDelay: `${-i * 4}s`,
              background: `radial-gradient(${l.size} ${l.size} at ${l.at}, rgb(${l.color} / 0.32), transparent 60%)`,
            }}
          />
        ))}
      {bursts.map((b) => (
        <div
          key={b.id}
          className="absolute size-[46vmin] -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
          style={{
            left: b.x,
            top: b.y,
            background: "radial-gradient(closest-side, rgb(255 150 60 / 0.35), rgb(255 60 90 / 0.12) 55%, transparent)",
            animation: reduced ? undefined : "fx-burst 1.1s ease-out both",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7 · Glitch — RGB split + displaced blocks, now and then             */
/* ------------------------------------------------------------------ */
type Block = { top: number; height: number; left: number; width: number; shift: number; hue: number };

function GlitchFx() {
  const active = useEffectActive("glitch");
  const { strength, frequency, blockSize } = useCinematic().effects.glitch;
  const reduced = useReduced();
  const [blocks, setBlocks] = useState<Block[]>([]);

  useEffect(() => {
    if (!active || reduced) return;
    const root = document.documentElement;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const scatter = () =>
      setBlocks(
        Array.from({ length: 2 + Math.round(strength * 7) }, () => ({
          top: rand(0, 100),
          height: blockSize * rand(0.4, 2),
          left: rand(-10, 60),
          width: rand(20, 90),
          shift: rand(-1, 1) * (8 + strength * 50),
          hue: rand(60, 300),
        })),
      );
    const hit = () => {
      const targets = movableTargets();
      root.classList.add("fx-glitching");
      root.style.setProperty("--fx-glitch-px", `${(2 + strength * 8).toFixed(1)}px`);
      const jolt = () => {
        const x = `${(rand(-1, 1) * strength * 12).toFixed(1)}px 0`;
        for (const t of targets) t.style.translate = x;
      };
      jolt();
      scatter();
      later(() => {
        jolt();
        scatter();
      }, 70);
      later(() => {
        root.classList.remove("fx-glitching");
        for (const t of targets) t.style.translate = "";
        setBlocks([]);
        schedule();
      }, rand(130, 220));
    };
    const schedule = () => later(hit, (14000 - frequency * 12600) * rand(0.6, 1.4));
    schedule();
    return () => {
      for (const t of timers) window.clearTimeout(t);
      root.classList.remove("fx-glitching");
      root.style.removeProperty("--fx-glitch-px");
      for (const t of movableTargets()) t.style.translate = "";
      setBlocks([]);
    };
  }, [active, reduced, strength, frequency, blockSize]);

  if (!active || !blocks.length) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[88] overflow-hidden">
      {blocks.map((b, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: `${b.top}%`,
            left: `${b.left}%`,
            width: `${b.width}%`,
            height: b.height,
            transform: `translateX(${b.shift}px)`,
            backdropFilter: `hue-rotate(${b.hue}deg) saturate(2.5) contrast(1.4)`,
            WebkitBackdropFilter: `hue-rotate(${b.hue}deg) saturate(2.5) contrast(1.4)`,
            background: i % 3 === 0 ? "rgb(0 255 220 / 0.07)" : "rgb(255 0 80 / 0.06)",
            borderTop: "1px solid rgb(255 255 255 / 0.18)",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8 · Cinematic bars                                                  */
/* ------------------------------------------------------------------ */
function BarsFx() {
  const active = useEffectActive("bars");
  const { height, opacity, hideOnScroll } = useCinematic().effects.bars;
  const reduced = useReduced();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) return;
    const update = () => setShown(!(hideOnScroll && window.scrollY > window.innerHeight * 0.2));
    const id = window.setTimeout(update, 150); // fade in just after load
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("scroll", update);
      setShown(false);
    };
  }, [active, hideOnScroll]);

  if (!active) return null;
  const bar = "absolute inset-x-0 bg-black ease-[cubic-bezier(0.22,1,0.36,1)]";
  const style = (from: string): CSSProperties => ({
    height: `${height}vh`,
    opacity: shown ? opacity : 0,
    transform: shown ? "none" : from,
    transition: reduced ? "none" : "transform 700ms, opacity 700ms",
  });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[45]">
      <div className={`${bar} top-0`} style={style("translateY(-100%)")} />
      <div className={`${bar} bottom-0`} style={style("translateY(100%)")} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 15 · Letterbox / aspect ratio — a matte, so no content is cropped   */
/* ------------------------------------------------------------------ */
function LetterboxFx() {
  const c = useCinematic();
  const v = useViewport();
  const reduced = useReduced();
  const [size, setSize] = useState({ w: 0, h: 0 });

  const sectionRatio = v.section ? c.sections[v.section]?.letterbox : undefined;
  const globalOn = effectOn(c, "letterbox") && ruleActive(scopeOf(c, "letterbox"), v);
  const ratio: AspectRatio | null = sectionRatio ?? (globalOn ? c.effects.letterbox.ratio : null);
  const anywhere = effectOn(c, "letterbox") || Object.values(c.sections).some((s) => s?.letterbox);

  useEffect(() => {
    if (!anywhere) return;
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anywhere]);

  if (!anywhere || !size.w) return null;
  const r = ratio ? ASPECT_VALUE[ratio] : size.w / size.h;
  // Wider screen than the ratio → pillarbox (side mattes); taller → letterbox (top / bottom).
  const pillar = size.w / size.h > r;
  const matte = ratio ? Math.max(0, pillar ? (size.w - size.h * r) / 2 : (size.h - size.w / r) / 2) : 0;
  const t = reduced ? "none" : "width 600ms cubic-bezier(0.22,1,0.36,1), height 600ms cubic-bezier(0.22,1,0.36,1)";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[45]">
      <div className="absolute inset-x-0 top-0 bg-black" style={{ height: pillar ? 0 : matte, transition: t }} />
      <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: pillar ? 0 : matte, transition: t }} />
      <div className="absolute inset-y-0 left-0 bg-black" style={{ width: pillar ? matte : 0, transition: t }} />
      <div className="absolute inset-y-0 right-0 bg-black" style={{ width: pillar ? matte : 0, transition: t }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 11 · Depth of field — a blur with a sharp hole at centre / cursor   */
/* ------------------------------------------------------------------ */
function DofFx() {
  const c = useCinematic();
  const v = useViewport();
  const ref = useRef<HTMLDivElement>(null);
  const { intensity, mode } = c.effects.depthOfField;
  const local = v.section ? c.sections[v.section]?.dof : undefined;
  const globalOn = effectOn(c, "depthOfField") && ruleActive(scopeOf(c, "depthOfField"), v);
  const blur = local ?? (globalOn ? intensity : 0);
  const cursor = mode === "cursor" && blur > 0;

  useEffect(() => {
    const el = ref.current;
    if (!cursor || !el) return;
    const onMove = (e: MouseEvent) => {
      el.style.setProperty("--dof-x", `${e.clientX}px`);
      el.style.setProperty("--dof-y", `${e.clientY}px`);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [cursor]);

  if (blur <= 0) return null;
  const mask = "radial-gradient(circle at var(--dof-x, 50%) var(--dof-y, 50%), transparent 0, transparent 22vmin, black 58vmin)";
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[35]"
      style={{ backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 12 · Motion blur — scroll speed → blur, stronger toward the edges   */
/* ------------------------------------------------------------------ */
function MotionBlurFx() {
  const active = useEffectActive("motionBlur");
  const { strength } = useCinematic().effects.motionBlur;
  const reduced = useReduced();
  const ref = useRef<HTMLDivElement>(null);
  const level = useRef(0);

  // An overlay's backdrop blur — never a filter on the page itself (that would re-anchor fixed content).
  useScrollVelocity((v) => {
    const el = ref.current;
    if (!el) return;
    const target = Math.min(10, Math.abs(v) * strength * 0.22);
    level.current += (target - level.current) * 0.25;
    const b = level.current < 0.3 ? 0 : level.current;
    el.style.backdropFilter = b ? `blur(${b.toFixed(1)}px)` : "";
    el.style.setProperty("-webkit-backdrop-filter", b ? `blur(${b.toFixed(1)}px)` : "");
  }, active && !reduced);

  if (!active || reduced) return null;
  const mask = "linear-gradient(to bottom, black 0%, rgb(0 0 0 / 0.45) 32%, rgb(0 0 0 / 0.45) 68%, black 100%)";
  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[35]" style={{ maskImage: mask, WebkitMaskImage: mask }} />;
}

/* ------------------------------------------------------------------ */
/* 10 · Camera shake — a hard scroll kicks the frame                   */
/* ------------------------------------------------------------------ */
function CameraShakeFx() {
  const active = useEffectActive("cameraShake");
  const { intensity, threshold } = useCinematic().effects.cameraShake;
  const reduced = useReduced();
  const state = useRef({ until: 0, cool: 0, targets: [] as HTMLElement[] });

  useScrollVelocity((v) => {
    const s = state.current;
    const now = performance.now();
    if (Math.abs(v) > threshold && now > s.cool) {
      s.until = now + 320;
      s.cool = now + 700;
      s.targets = movableTargets();
    }
    if (!s.targets.length) return;
    const left = s.until - now;
    if (left <= 0) {
      for (const t of s.targets) t.style.translate = "";
      s.targets = [];
      return;
    }
    const amp = intensity * 14 * (left / 320) ** 2; // quadratic decay
    const off = `${(rand(-1, 1) * amp).toFixed(1)}px ${(rand(-1, 1) * amp).toFixed(1)}px`;
    for (const t of s.targets) t.style.translate = off;
  }, active && !reduced);

  useEffect(
    () => () => {
      for (const t of state.current.targets) t.style.translate = "";
    },
    [],
  );
  return null;
}

/* ------------------------------------------------------------------ */
/* 16 · Time remapping — a speed ramp on the smooth scroll             */
/* ------------------------------------------------------------------ */
function TimeRemapFx() {
  const c = useCinematic();
  const on = effectOn(c, "timeRemap");
  const { strength } = c.effects.timeRemap;
  const reduced = useReduced();
  const base = useRef<number | null>(null);

  useScrollVelocity((v) => {
    const lenis = getLenis();
    if (!lenis) return;
    base.current ??= lenis.options.lerp ?? 0.08;
    // Fast scrolling → snappier (speeds up); near a section's start → slower (the "ramp" into a cut).
    const speed = Math.min(1, Math.abs(v) / 40);
    let near = 0;
    for (const el of document.querySelectorAll<HTMLElement>("[data-fx-section]")) {
      const top = el.getBoundingClientRect().top;
      const d = Math.abs(top - window.innerHeight * 0.3) / window.innerHeight;
      near = Math.max(near, 1 - Math.min(1, d / 0.18));
    }
    const lerp = base.current * (1 + strength * 1.6 * speed) * (1 - strength * 0.45 * near);
    lenis.options.lerp = Math.min(0.3, Math.max(0.02, lerp));
  }, on && !reduced);

  useEffect(() => {
    if (on && !reduced) return;
    const lenis = getLenis();
    if (lenis && base.current !== null) lenis.options.lerp = base.current;
  }, [on, reduced]);
  return null;
}

/* ------------------------------------------------------------------ */
/* 18 · Film scratches                                                 */
/* ------------------------------------------------------------------ */
function FilmScratchFx() {
  const active = useEffectActive("filmScratch");
  const { density } = useCinematic().effects.filmScratch;
  const reduced = useReduced();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!active || !canvas || !ctx) return;
    const W = 480;
    const H = 270;
    canvas.width = W;
    canvas.height = H;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const n = Math.round(density * 5 * Math.random() + density * 2);
      for (let i = 0; i < n; i++) {
        // Mostly vertical hairlines (the real thing), now and then a horizontal tear.
        const vertical = Math.random() > 0.18;
        ctx.strokeStyle = Math.random() < 0.6 ? `rgb(255 255 255 / ${rand(0.15, 0.55)})` : `rgb(0 0 0 / ${rand(0.2, 0.6)})`;
        ctx.lineWidth = rand(0.4, 1.1);
        ctx.beginPath();
        if (vertical) {
          const x = Math.random() * W;
          const y0 = Math.random() < 0.5 ? 0 : rand(0, H * 0.6);
          ctx.moveTo(x, y0);
          ctx.lineTo(x + rand(-3, 3), y0 + rand(H * 0.3, H));
        } else {
          const y = Math.random() * H;
          const x0 = rand(0, W * 0.7);
          ctx.moveTo(x0, y);
          ctx.lineTo(x0 + rand(W * 0.1, W * 0.35), y + rand(-1.5, 1.5));
        }
        ctx.stroke();
      }
    };
    draw();
    if (reduced) return;
    const id = window.setInterval(draw, 1000 / 12);
    return () => window.clearInterval(id);
  }, [active, density, reduced]);

  if (!active) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[88] size-full mix-blend-screen" />;
}

/* ------------------------------------------------------------------ */
/* 5 · Film burn · 17 · Shutter flash — on page transitions            */
/* ------------------------------------------------------------------ */
function TransitionFx() {
  const c = useCinematic();
  const reduced = useReduced();
  const burnOn = effectOn(c, "filmBurn");
  const flashOn = effectOn(c, "shutterFlash");
  const { intensity, duration } = c.effects.filmBurn;
  const burnRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const bladesRef = useRef<HTMLDivElement>(null);

  useFxEvent(
    "transition",
    () => {
      if (burnOn && burnRef.current) {
        const el = burnRef.current;
        el.style.setProperty("--burn-x", `${rand(15, 85)}%`);
        el.style.setProperty("--burn-y", `${rand(20, 80)}%`);
        el.animate(
          [
            { opacity: 0, transform: "scale(0.5)", filter: "brightness(1)" },
            { opacity: intensity, transform: "scale(1.1)", filter: "brightness(1.6)", offset: 0.35 },
            { opacity: intensity * 0.7, transform: "scale(1.5)", filter: "brightness(2.2)", offset: 0.6 },
            { opacity: 0, transform: "scale(2)", filter: "brightness(1)" },
          ],
          { duration: duration * 1000, easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
        );
      }
      if (flashOn && flashRef.current && bladesRef.current) {
        flashRef.current.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.15 }, { opacity: 0 }], { duration: 260, easing: "ease-out" });
        bladesRef.current.animate(
          [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)", offset: 0.45 }, { clipPath: "inset(100% 0 0 0)" }],
          { duration: 220, easing: "cubic-bezier(0.7, 0, 0.3, 1)" },
        );
      }
    },
    (burnOn || flashOn) && !reduced,
  );

  if ((!burnOn && !flashOn) || reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[96] overflow-hidden">
      {burnOn && (
        <div
          ref={burnRef}
          className="absolute inset-[-25%] opacity-0 mix-blend-screen"
          style={{
            background:
              "radial-gradient(30% 34% at var(--burn-x, 50%) var(--burn-y, 50%), rgb(255 250 220) 0%, rgb(255 180 60 / 0.9) 22%, rgb(255 70 20 / 0.75) 45%, rgb(120 10 0 / 0.5) 70%, transparent 85%), radial-gradient(20% 18% at calc(var(--burn-x, 50%) + 22%) calc(var(--burn-y, 50%) - 14%), rgb(255 140 40 / 0.7), transparent 70%)",
          }}
        />
      )}
      {flashOn && (
        <>
          <div ref={bladesRef} className="absolute inset-0 bg-black" style={{ clipPath: "inset(0 0 100% 0)" }} />
          <div ref={flashRef} className="absolute inset-0 bg-white opacity-0" />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sound Studio — hover, click, transition, notification, error, success */
/* ------------------------------------------------------------------ */
const INTERACTIVE = "a, button, [role='button'], [data-hover], label, summary";

function SoundFx() {
  const { sound } = useCinematic();
  // The visitor's own choice (command palette → Sound) wins; until they pick, the admin's switch decides.
  const [pref, setPref] = useState<"on" | "off" | null>(null);
  useEffect(() => {
    const read = () => setPref(readSoundPref());
    read();
    window.addEventListener("3skrino:sound", read);
    return () => window.removeEventListener("3skrino:sound", read);
  }, []);
  const on = sound.enabled && pref !== "off";
  const cfg = useRef(sound);
  useEffect(() => {
    cfg.current = sound;
  }, [sound]);

  const play = (name: SoundName) => {
    const s = cfg.current;
    const slot = s.sounds[name];
    if (slot.enabled) playUiSound(name, slot, s.volume);
  };

  useEffect(() => {
    if (!on) return;
    let last: Element | null = null;
    let lastAt = 0;
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest(INTERACTIVE) ?? null;
      if (el === last) return;
      last = el;
      const now = performance.now();
      if (!el || now - lastAt < 70) return;
      lastAt = now;
      play("hover");
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest(INTERACTIVE)) play("click");
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [on]); // play() reads the latest config through a ref

  useFxEvent("transition", () => play("transition"), on);
  useUiSoundRequests(play, on);
  return null;
}

/* ------------------------------------------------------------------ */
/* Motion Lab — global speed, hover duration, easing                   */
/* ------------------------------------------------------------------ */
function MotionFx() {
  const { motion } = useCinematic();
  const reduced = useReduced();
  const custom = useMemo(() => motion.hover !== 300 || motion.easing !== "cubic-bezier(0.22, 1, 0.36, 1)", [motion.hover, motion.easing]);

  useEffect(() => {
    if (reduced) return;
    gsap.globalTimeline.timeScale(motion.speed);
    return () => {
      gsap.globalTimeline.timeScale(1);
    };
  }, [motion.speed, reduced]);

  useEffect(() => {
    const root = document.documentElement;
    if (!custom) return;
    root.classList.add("fx-motion-hover");
    root.style.setProperty("--motion-hover", `${Math.round(motion.hover / motion.speed)}ms`);
    root.style.setProperty("--motion-ease", motion.easing);
    return () => {
      root.classList.remove("fx-motion-hover");
      root.style.removeProperty("--motion-hover");
      root.style.removeProperty("--motion-ease");
    };
  }, [custom, motion.hover, motion.easing, motion.speed]);

  return null;
}
