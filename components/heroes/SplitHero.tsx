"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Placeholder from "@/components/ui/Placeholder";
import Timecode from "@/components/ui/Timecode";
import { getCategory } from "@/data/categories";
import { site } from "@/data/site";
import { RICH_MOTION_QUERY, useMediaQuery } from "@/lib/hooks";
import { useHeroConfig, useSiteConfig } from "@/lib/live-config";
import { getLenis } from "@/lib/scroll";
import { cn } from "@/lib/utils";
import { HeroCtas, pickReel, useTrackProgress, useTypewriter } from "./shared";

/** Where the seam may be dragged (share of the width given to the left page). */
const SEAM = { min: 0.26, max: 0.74, rest: 0.5, magnet: 0.07, keyStep: 0.02 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Hero 2 — Split Screen Editorial. A magazine spread: the name types itself
 * onto a black left page, a muted reel loops on the right, and a draggable
 * seam divides them (it leans toward the pointer a little). Scrolling hands
 * the whole frame to the reel; clicking the reel opens it full-screen.
 * Phones / reduced motion: the pages stack, nothing types or drifts.
 */
export default function SplitHero() {
  const config = useHeroConfig();
  const { content, cinematic } = useSiteConfig();
  const reel = pickReel(cinematic?.heroOptions.splitReel ?? "");
  const rich = useMediaQuery(RICH_MOTION_QUERY);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(SEAM.rest);
  const [lean, setLean] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [player, setPlayer] = useState(false);
  const progress = useTrackProgress(sectionRef, rich);

  const typing = !reduced;
  // The role line retypes through admin → Roles on the Roles interval.
  const roles = config.roles.items.length ? config.roles.items : [content.role];
  const [roleIndex, setRoleIndex] = useState(0);
  useEffect(() => {
    if (!typing || roles.length < 2) return;
    const id = window.setInterval(() => setRoleIndex((i) => (i + 1) % roles.length), Math.max(2.5, config.roles.interval) * 1000);
    return () => window.clearInterval(id);
  }, [typing, roles.length, config.roles.interval]);
  const role = roles[roleIndex % roles.length] ?? content.role;
  const nameN = useTypewriter(site.name, { delay: 250, cps: 14, enabled: typing });
  const roleN = useTypewriter(role, { delay: roleIndex === 0 ? 900 : 0, cps: 40, enabled: typing });
  const tagN = useTypewriter(content.tagline, { delay: 1500, cps: 70, enabled: typing });

  // Magnetic seam: it leans a little toward the pointer.
  useEffect(() => {
    const stage = stageRef.current;
    if (!rich || !stage) return;
    let target = 0;
    let cur = 0;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      target = ((e.clientX - r.left) / r.width - 0.5) * 2 * SEAM.magnet;
    };
    const loop = () => {
      cur += (target - cur) * 0.08;
      setLean((l) => (Math.abs(l - cur) > 0.0005 ? cur : l));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    stage.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      stage.removeEventListener("pointermove", onMove);
    };
  }, [rich]);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      setSplit(clamp((ev.clientX - r.left) / r.width, SEAM.min, SEAM.max));
    };
    const up = () => {
      setDragging(false);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onSeamKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowLeft" ? -SEAM.keyStep : e.key === "ArrowRight" ? SEAM.keyStep : 0;
    if (e.key === "Home") setSplit(SEAM.rest);
    if (!d) return;
    e.preventDefault();
    setSplit((s) => clamp(s + d, SEAM.min, SEAM.max));
  };

  const logos = config.logos.enabled ? config.logos.items.filter((l) => l.visible) : [];
  const centre = config.poses.ladder[3]?.src ?? "/hero/silhouette-900.webp";
  // Scroll: the reel takes over the frame.
  const take = rich ? smooth(clamp(progress / 0.8, 0, 1)) : 0;
  const left = (rich && !dragging ? clamp(split + lean, SEAM.min, SEAM.max) : split) * (1 - take);
  const category = reel ? getCategory(reel.category) : undefined;

  const reelMedia = (controls: boolean) =>
    reel?.videoUrl ? (
      <video
        key={controls ? "full" : "loop"}
        src={reel.videoUrl}
        poster={reel.thumbnail || undefined}
        autoPlay={!reduced || controls}
        muted={!controls}
        loop
        playsInline
        controls={controls}
        preload="metadata"
        aria-label={reel.title}
        className={cn("absolute inset-0 size-full", controls ? "object-contain" : "object-cover")}
      />
    ) : (
      <Placeholder title={reel?.title ?? site.name} seed={3} image={reel?.thumbnail || undefined} size="lg" />
    );

  const leftPage = (
    <div className="relative flex h-full flex-col justify-end overflow-hidden px-6 pb-28 pt-24 md:px-12">
      {/* The silhouette as an editorial still — static, monochrome. */}
      <div aria-hidden className="pointer-events-none absolute -bottom-[6%] -left-[18%] aspect-square h-[92%] opacity-40 grayscale">
        <Image src={centre} alt="" fill sizes="60vh" className="object-contain object-bottom" priority unoptimized={centre.startsWith("http")} />
      </div>
      <div className="relative" style={{ opacity: 1 - take * 1.4 }}>
        <p className="mb-6 font-mono text-[11px] uppercase tracking-widest text-muted">
          <span className="sr-only">{content.role}</span>
          <span aria-hidden>
            {role.slice(0, roleN)}
            <span className="animate-pulse text-accent">▍</span>
          </span>
        </p>
        <h1 aria-label={site.name} className="type-display text-[clamp(3.6rem,11vw,12rem)] leading-[0.85]">
          <span aria-hidden>{site.name.slice(0, nameN)}</span>
          <span aria-hidden className="text-transparent">
            {site.name.slice(nameN)}
          </span>
        </h1>
        <p className="mt-6 max-w-xl font-mono text-[13px] leading-relaxed text-fg/75 md:text-sm">
          <span className="sr-only">{content.tagline}</span>
          <span aria-hidden>
            {content.tagline.slice(0, tagN)}
            {tagN < content.tagline.length && <span className="animate-pulse text-accent">▍</span>}
          </span>
        </p>
        <HeroCtas className="mt-10" />
      </div>
    </div>
  );

  const rightPage = (
    <button
      type="button"
      onClick={() => setPlayer(true)}
      data-cursor-label="Play full"
      aria-label={`Play ${reel?.title ?? "the reel"} full-screen`}
      className="group relative block size-full overflow-hidden bg-bg-soft text-left"
    >
      {reelMedia(false)}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
      <span className="pointer-events-none absolute inset-x-5 bottom-24 flex items-end justify-between gap-4 md:inset-x-8">
        <span>
          <span className="block font-mono text-[10px] uppercase tracking-widest text-white/60">{category?.name ?? "Reel"}</span>
          <span className="type-label mt-1 block text-2xl text-white md:text-3xl">{reel?.title ?? "Showreel"}</span>
        </span>
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-white/40 text-xs text-white transition-colors group-hover:border-accent group-hover:text-accent">
          ▶
        </span>
      </span>
    </button>
  );

  return (
    <section id="home" ref={sectionRef} className={cn("relative bg-black text-fg", rich ? "h-[200svh]" : "")}>
      <div ref={stageRef} className={cn("relative overflow-hidden", rich ? "sticky top-0 h-svh" : "flex min-h-svh flex-col")}>
        {/* Top strip: timecode + frame rate, like a monitor's overlay. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 pt-20 font-mono text-[10px] uppercase tracking-widest text-white/55 md:px-12">
          <span className="flex items-center gap-2">
            <span className="size-1.5 animate-pulse rounded-full bg-accent-2" />
            <Timecode running={!reduced} />
          </span>
          <span className="flex items-center gap-3">
            <span className="border border-white/25 px-1.5 py-0.5">25 FPS</span>
            <span className="hidden sm:inline">{content.location}</span>
          </span>
        </div>

        {rich ? (
          <>
            <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${left * 100}%` }}>
              <div className="h-full" style={{ width: `${Math.max(left, SEAM.rest) * 100}vw` }}>
                {leftPage}
              </div>
            </div>
            <div className="absolute inset-y-0 right-0" style={{ width: `${(1 - left) * 100}%` }}>
              {rightPage}
            </div>
            {/* The seam */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the spread"
              aria-valuemin={Math.round(SEAM.min * 100)}
              aria-valuemax={Math.round(SEAM.max * 100)}
              aria-valuenow={Math.round(split * 100)}
              tabIndex={0}
              onPointerDown={startDrag}
              onKeyDown={onSeamKey}
              data-cursor-label="Drag"
              data-hover
              className="group/seam absolute inset-y-0 z-30 w-6 -translate-x-1/2 cursor-col-resize touch-none focus-visible:outline-none"
              style={{ left: `${left * 100}%`, opacity: 1 - take }}
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/30 transition-colors group-hover/seam:bg-accent group-focus-visible/seam:bg-accent" />
              <span className="absolute left-1/2 top-1/2 flex h-12 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-white/30 bg-black font-mono text-[9px] text-white/70 transition-colors group-hover/seam:border-accent group-hover/seam:text-accent">
                ⟷
              </span>
              <span className="absolute left-1/2 top-[calc(50%+36px)] -translate-x-1/2 font-mono text-[9px] tabular-nums text-white/40">
                {Math.round(left * 100)}/{Math.round((1 - left) * 100)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="relative h-[62svh] w-full">{rightPage}</div>
            <div className="relative flex-1">{leftPage}</div>
          </>
        )}

        {/* Client logos */}
        {logos.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 z-20 overflow-hidden border-t border-white/10 bg-black/80 backdrop-blur-sm">
            <div className="marquee flex py-4">
              <div className="marquee-track flex w-max items-center" style={{ "--marquee-duration": "36s" } as CSSProperties}>
                {[0, 1].map((copy) => (
                  <ul key={copy} aria-hidden={copy === 1 || undefined} className="flex shrink-0 items-center">
                    {logos.map((l) => (
                      <li key={l.id} className="px-8 md:px-12">
                        {/* eslint-disable-next-line @next/next/no-img-element -- logos are arbitrary SVG / blob URLs */}
                        <img src={l.imageUrl} alt={copy ? "" : l.name} className="h-6 w-auto opacity-60 md:h-7" style={{ maxWidth: (l.size ?? 60) * 2 }} />
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {player && <ReelPlayer onClose={() => setPlayer(false)}>{reelMedia(true)}</ReelPlayer>}
    </section>
  );
}

/** The full-screen reel: Esc / ✕ closes, the page underneath stops scrolling. */
function ReelPlayer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const lenis = getLenis();
    lenis?.stop();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      lenis?.start();
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Reel" tabIndex={-1} className="fixed inset-0 z-[120] bg-black outline-none">
      {children}
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={() => void ref.current?.requestFullscreen?.().catch(() => undefined)}
          className="border border-white/30 bg-black/60 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white hover:border-accent hover:text-accent"
        >
          Full screen
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="border border-white/30 bg-black/60 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white hover:border-accent hover:text-accent"
        >
          ✕ Close
        </button>
      </div>
    </div>
  );
}
