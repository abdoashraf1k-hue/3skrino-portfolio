"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatTimecode } from "@/components/ui/Timecode";
import { site } from "@/data/site";
import { useInView, useMediaQuery } from "@/lib/hooks";
import { useHeroConfig, useSiteConfig } from "@/lib/live-config";
import { cn } from "@/lib/utils";
import { HeroCtas, heroPoses } from "./shared";

/** Each pose holds the program monitor for this long; the sequence is 9 × 2s. */
const SECONDS_PER_POSE = 2;
/** Discrete zoom levels; the pointer's height picks one (lower = closer to the timeline = more zoom). */
const ZOOMS = [1, 2, 4] as const;
const TRACK_LABEL_W = 56;

type Mode = { kind: "scrub" } | { kind: "play"; dir: 1 | -1; rate: 1 | 2 } | { kind: "parked" };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Hero 4 — Timeline Scrubber. You're inside the edit: a program monitor
 * (the silhouette on the neon grid, framed in a player) over a sequence
 * timeline. The pointer is the playhead — the 9 poses are clips along it —
 * and its height zooms the timeline. Space / J K L play, ← → jump between
 * keyframes, a click on a keyframe parks on it. Touch: drag the timeline.
 * Reduced motion: no autoplay; scrubbing still works.
 */
export default function TimelineHero() {
  const config = useHeroConfig();
  const { content, cinematic } = useSiteConfig();
  const poses = useMemo(() => heroPoses(config), [config]);
  const roles = config.roles.items;
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const finePointer = useMediaQuery("(pointer: fine)");
  const autoplay = (cinematic?.heroOptions.timelineAutoplay ?? true) && !reduced;

  const sectionRef = useRef<HTMLElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: false, rootMargin: "0px" });
  const [t, setT] = useState(0.5 / poses.length);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: "parked" });
  const [laneW, setLaneW] = useState(1000);
  const parkedAt = useRef<{ x: number; y: number } | null>(null);
  const total = poses.length * SECONDS_PER_POSE;
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Autoplay until the pointer takes over.
  useEffect(() => {
    if (!autoplay) return;
    const id = requestAnimationFrame(() => setMode((m) => (m.kind === "parked" && !parkedAt.current ? { kind: "play", dir: 1, rate: 1 } : m)));
    return () => cancelAnimationFrame(id);
  }, [autoplay]);

  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLaneW(Math.max(1, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Playback loop.
  useEffect(() => {
    if (mode.kind !== "play" || !inView) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => {
        const n = v + (mode.dir * mode.rate * dt) / total;
        return n > 1 ? n - 1 : n < 0 ? n + 1 : n;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, inView, total]);

  const keyframeT = useCallback((i: number) => (i + 0.5) / poses.length, [poses.length]);
  const park = useCallback((v: number, e?: { clientX: number; clientY: number }) => {
    setT(clamp(v, 0, 0.9999));
    setMode({ kind: "parked" });
    parkedAt.current = e ? { x: e.clientX, y: e.clientY } : { x: -1e4, y: -1e4 };
  }, []);

  const scrubFrom = (clientX: number) => {
    const lane = laneRef.current?.getBoundingClientRect();
    if (!lane) return;
    setT(clamp((clientX - lane.left) / lane.width, 0, 0.9999));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return; // touch scrubs by dragging the timeline (below)
    // Parked on a keyframe: hold until the pointer clearly moves away.
    const p = parkedAt.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 40) return;
    parkedAt.current = null;
    if (mode.kind !== "scrub") setMode({ kind: "scrub" });
    scrubFrom(e.clientX);
    const r = sectionRef.current?.getBoundingClientRect();
    if (r) {
      const y = (e.clientY - r.top) / r.height;
      setZoomIdx(y < 0.45 ? 0 : y < 0.72 ? 1 : 2);
    }
  };

  const onLaneDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    parkedAt.current = null;
    setMode({ kind: "scrub" });
    scrubFrom(e.clientX);
  };

  // J K L · Space · ← → (only while the hero is on screen and nobody's typing).
  useEffect(() => {
    if (!inView) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const current = Math.min(poses.length - 1, Math.floor(tRef.current * poses.length));
      if (k === " ") {
        e.preventDefault();
        setMode((m) => (m.kind === "play" ? { kind: "parked" } : { kind: "play", dir: 1, rate: 1 }));
        parkedAt.current = { x: -1e4, y: -1e4 };
      } else if (k === "k") {
        setMode({ kind: "parked" });
        parkedAt.current = { x: -1e4, y: -1e4 };
      } else if (k === "l" || k === "j") {
        const dir = k === "l" ? 1 : -1;
        setMode((m) => ({ kind: "play", dir, rate: m.kind === "play" && m.dir === dir ? 2 : 1 }));
        parkedAt.current = { x: -1e4, y: -1e4 };
      } else if (k === "arrowright" || k === "arrowleft") {
        e.preventDefault();
        const next = k === "arrowright" ? Math.min(poses.length - 1, current + 1) : Math.max(0, current - 1);
        park(keyframeT(next));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inView, poses.length, park, keyframeT]);

  // Zoom: the lane shows 1/zoom of the sequence, framed so the playhead stays put.
  const zoom = ZOOMS[zoomIdx];
  const start = clamp(t - t / zoom, 0, 1 - 1 / zoom);
  const x = (time: number) => (time - start) * laneW * zoom;
  const active = Math.min(poses.length - 1, Math.floor(t * poses.length));
  const pose = poses[active];
  const tc = formatTimecode(t * total * 1000);

  // Ruler ticks every second (every half-second at 4×).
  const tickEvery = zoom >= 4 ? 0.5 : 1;
  const ticks = Array.from({ length: Math.floor(total / tickEvery) + 1 }, (_, i) => i * tickEvery);
  // V2: the roles as title clips across the sequence.
  const roleClips = roles.map((r, i) => ({ label: r, from: i / roles.length, to: (i + 1) / roles.length }));
  const playing = mode.kind === "play";

  return (
    <section
      id="home"
      ref={sectionRef}
      onPointerMove={finePointer ? onPointerMove : undefined}
      className="relative flex min-h-svh flex-col overflow-hidden bg-[#070707] pt-20 text-fg"
      aria-label={`${site.name} — sequence timeline`}
    >
      {/* Top bar */}
      <div className="flex items-start justify-between gap-6 px-5 md:px-10">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Timecode</p>
          <p className="font-mono text-2xl tabular-nums text-accent md:text-4xl" aria-live="off">
            {tc}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg/80">Sequence 01 — {site.name}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            25 fps · {total}s · zoom {zoom}× · {playing ? (mode.dir < 0 ? "◀ rev" : "▶ play") + (mode.rate === 2 ? " 2×" : "") : mode.kind === "scrub" ? "scrub" : "■ park"}
          </p>
        </div>
      </div>

      {/* Program monitor */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-6 md:flex-row md:items-end md:gap-10 md:px-10">
        <div className="relative aspect-video w-full max-w-[min(100%,calc((100svh-26rem)*16/9))] overflow-hidden border border-white/15 bg-black md:w-[62%]">
          <ProgramMonitor poses={poses} active={active} t={t} />
          {/* Title-safe frame + monitor HUD */}
          <div aria-hidden className="pointer-events-none absolute inset-[6%] border border-dashed border-white/10" />
          <span className="absolute left-3 top-2 font-mono text-[9px] uppercase tracking-widest text-white/50">Program</span>
          <span className="absolute right-3 top-2 font-mono text-[9px] uppercase tracking-widest text-white/50">
            Pose {String(active + 1).padStart(2, "0")} / {String(poses.length).padStart(2, "0")} — {pose?.label}
          </span>
          <div className="absolute inset-x-[6%] bottom-[8%]">
            <h1 className="type-display text-[clamp(2.4rem,6.5vw,6.5rem)] leading-[0.85] [text-shadow:0_2px_30px_rgb(0_0_0/0.8)]">{site.name}</h1>
          </div>
        </div>
        <div className="w-full max-w-md md:w-auto md:pb-2">
          <p className="text-base leading-snug text-fg/75 md:text-lg">{content.tagline}</p>
          <HeroCtas className="mt-6" />
        </div>
      </div>

      {/* Timeline */}
      <div className="border-t border-white/10 bg-[#0b0b0b] px-3 pb-4 pt-2 md:px-6">
        <div className="flex">
          <div style={{ width: TRACK_LABEL_W }} className="shrink-0" />
          {/* Ruler */}
          <div className="relative h-6 flex-1 overflow-hidden border-b border-white/10">
            <div className="absolute inset-y-0 left-0" style={{ width: laneW * zoom, transform: `translateX(${-start * laneW * zoom}px)` }}>
              {ticks.map((s) => (
                <span key={s} className="absolute bottom-0 h-2 w-px bg-white/25" style={{ left: (s / total) * laneW * zoom }}>
                  {Number.isInteger(s) && (
                    <span className="absolute -top-3.5 left-1 whitespace-nowrap font-mono text-[8px] tabular-nums text-white/35">{formatTimecode(s * 1000, 3)}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative flex">
          {/* Track headers */}
          <div style={{ width: TRACK_LABEL_W }} className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-white/40">
            {["V2", "V1", "A1"].map((tr) => (
              <div key={tr} className="flex h-9 items-center border-b border-white/5 pl-1 md:h-10">
                {tr}
              </div>
            ))}
          </div>

          <div ref={laneRef} onPointerDown={onLaneDrag} onPointerMove={(e) => e.buttons && e.pointerType !== "mouse" && scrubFrom(e.clientX)} className="relative flex-1 touch-pan-y overflow-hidden">
            <div className="relative" style={{ width: laneW * zoom, transform: `translateX(${-start * laneW * zoom}px)` }}>
              {/* V2 — titles */}
              <div className="relative h-9 border-b border-white/5 md:h-10">
                {roleClips.map((c) => (
                  <span
                    key={c.label}
                    className="absolute top-1.5 bottom-1.5 overflow-hidden border border-white/15 bg-white/[0.06] px-1.5 font-mono text-[9px] uppercase leading-[1.6rem] tracking-wider text-white/55"
                    style={{ left: c.from * laneW * zoom + 1, width: (c.to - c.from) * laneW * zoom - 2 }}
                  >
                    T · {c.label}
                  </span>
                ))}
              </div>
              {/* V1 — the poses as clips, cross-dissolves between, a keyframe on each */}
              <div className="relative h-9 border-b border-white/5 md:h-10">
                {poses.map((p, i) => {
                  const from = i / poses.length;
                  const w = laneW * zoom / poses.length;
                  const on = i === active;
                  return (
                    <span
                      key={p.id}
                      className={cn(
                        "absolute top-1 bottom-1 overflow-hidden border px-1.5 font-mono text-[9px] uppercase leading-[1.75rem] tracking-wider transition-colors",
                        on ? "border-accent/70 bg-accent/15 text-accent" : "border-white/15 bg-white/[0.04] text-white/50",
                      )}
                      style={{ left: from * laneW * zoom + 1, width: w - 2, boxShadow: `inset 3px 0 0 ${p.tint}` }}
                    >
                      {p.label}
                    </span>
                  );
                })}
                {poses.slice(1).map((p, i) => (
                  <span
                    key={`x-${p.id}`}
                    aria-hidden
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white/30 bg-[#0b0b0b]"
                    style={{ left: ((i + 1) / poses.length) * laneW * zoom }}
                    title="Cross dissolve"
                  />
                ))}
                {poses.map((p, i) => (
                  <button
                    key={`k-${p.id}`}
                    type="button"
                    onClick={(e) => park(keyframeT(i), e)}
                    data-cursor-label={p.label}
                    aria-label={`Jump to ${p.label}`}
                    className="group/key absolute -top-1 z-10 -translate-x-1/2 p-1"
                    style={{ left: keyframeT(i) * laneW * zoom }}
                  >
                    <span className={cn("block size-2 rotate-45 transition-colors", i === active ? "bg-accent" : "bg-white/50 group-hover/key:bg-accent")} />
                  </button>
                ))}
              </div>
              {/* A1 — waveform */}
              <div className="relative h-9 md:h-10">
                <Waveform width={laneW * zoom} />
              </div>
            </div>

            {/* Playhead */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0 z-20 w-px bg-accent" style={{ left: x(t) }}>
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-accent" />
            </div>
          </div>
        </div>

        {/* Hints */}
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[9px] uppercase tracking-widest text-white/35">
          <span>
            <Kbd>J</Kbd> <Kbd>K</Kbd> <Kbd>L</Kbd> shuttle
          </span>
          <span>
            <Kbd>←</Kbd> <Kbd>→</Kbd> keyframes
          </span>
          <span>
            <Kbd>Space</Kbd> play
          </span>
          <span className="hidden md:inline">move ↕ to zoom · move ↔ to scrub</span>
          <span className="md:hidden">drag the timeline to scrub</span>
        </p>
      </div>
    </section>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="border border-white/20 px-1 py-px font-mono text-[9px] text-white/60">{children}</kbd>;
}

/** The player's picture: neon grid floor, a prism streak and the current pose with its rim light. */
function ProgramMonitor({ poses, active, t }: { poses: ReturnType<typeof heroPoses>; active: number; t: number }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-0 top-[34%] h-[34%]" style={{ background: "radial-gradient(50% 50% at 50% 50%, rgb(255 45 45 / 0.18), transparent 70%)" }} />
      <div className="absolute inset-x-0 bottom-0 h-[48%] overflow-hidden [perspective:300px]">
        <div
          className="absolute -inset-x-1/2 bottom-0 h-[160%] origin-bottom [transform:rotateX(62deg)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(231 254 85 / 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgb(231 254 85 / 0.45) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            backgroundPosition: `0 ${t * 640}px`,
            maskImage: "linear-gradient(to top, black 10%, transparent 85%)",
            WebkitMaskImage: "linear-gradient(to top, black 10%, transparent 85%)",
          }}
        />
      </div>
      {/* Prism: a diagonal spectral streak that slides with the playhead. */}
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background: `linear-gradient(${105 + t * 40}deg, transparent 38%, rgb(231 254 85 / 0.10) 46%, rgb(255 106 31 / 0.12) 50%, rgb(255 45 45 / 0.10) 54%, transparent 62%)`,
        }}
      />
      {poses.map((p, i) => (
        <div
          key={p.id}
          className="absolute bottom-0 left-1/2 aspect-square h-[96%] -translate-x-1/2 transition-opacity duration-150"
          style={{ opacity: i === active ? 1 : 0, maskImage: "linear-gradient(to top, transparent 0%, black 14%)", WebkitMaskImage: "linear-gradient(to top, transparent 0%, black 14%)" }}
        >
          <Image
            src={p.src}
            alt=""
            fill
            sizes="(min-width: 768px) 40vw, 90vw"
            priority={i === active}
            unoptimized={p.src.startsWith("http")}
            className="object-contain object-bottom"
            style={{ filter: `brightness(0.82) drop-shadow(0 -1px 0 ${p.tint}e6) drop-shadow(0 0 10px ${p.tint}59) drop-shadow(0 0 26px rgb(255 45 45 / 0.25))` }}
          />
        </div>
      ))}
    </div>
  );
}

/** A deterministic pseudo-waveform for the audio track. */
function Waveform({ width }: { width: number }) {
  const bars = Math.max(40, Math.floor(width / 4));
  const d = useMemo(() => {
    let path = "";
    for (let i = 0; i < bars; i++) {
      const v = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.113) * Math.sin(i * 0.021 + 1));
      const h = v * 13;
      path += `M${i * 4 + 1} ${16 - h}V${16 + h}`;
    }
    return path;
  }, [bars]);
  return (
    <svg aria-hidden className="absolute inset-x-0 top-1 h-8" width={width} height="32" viewBox={`0 0 ${bars * 4} 32`} preserveAspectRatio="none">
      <rect x="0" y="2" width={bars * 4} height="28" fill="rgb(61 255 176 / 0.05)" />
      <path d={d} stroke="rgb(61 255 176 / 0.55)" strokeWidth="1.5" />
    </svg>
  );
}
