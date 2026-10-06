"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { HERO_VARIANTS } from "@/data/cinematic-defaults";
import type { HeroConfig, HeroPose } from "@/data/hero-config";
import { projects, type Project } from "@/data/projects";
import type { HeroVariant } from "@/data/site-config";
import { T } from "@/lib/brand";
import { useSiteConfig } from "@/lib/live-config";

/** Every pose in story order: up, the left → right ladder, down (9). */
export function heroPoses(config: HeroConfig): HeroPose[] {
  return [config.poses.up, ...config.poses.ladder, config.poses.down];
}

/** Every pose by id — the ladder, up / down and the expressions (Sprint 11). */
export function poseMap(config: HeroConfig): Map<string, HeroPose> {
  return new Map([...heroPoses(config), ...(config.expressions ?? [])].map((p) => [p.id, p]));
}

/** Poses whose lenses sit where the centre pose's do (the glint can draw on them). */
export const isFrontal = (p: HeroPose | undefined, centerId: string) => Boolean(p && (p.id === centerId || p.tags?.includes("frontal")));

export const HERO_VARIANT_PARAM = "heroVariant";

function readParam(): HeroVariant | null {
  const v = new URLSearchParams(window.location.search).get(HERO_VARIANT_PARAM);
  return v && (HERO_VARIANTS as readonly string[]).includes(v) ? (v as HeroVariant) : null;
}
const noop = () => () => {};

/**
 * The hero to render: ?heroVariant=… (the admin's Heroes previews) wins, then
 * the config (admin → Heroes). The server always renders the configured one.
 */
export function useHeroVariant(): HeroVariant {
  const forced = useSyncExternalStore(noop, readParam, () => null);
  const { heroVariant } = useSiteConfig();
  return forced ?? heroVariant ?? "cinematic";
}

/** The reel for the Split hero: the chosen project, else the first featured vertical with footage. */
export function pickReel(id: string): Project | null {
  const withVideo = projects.filter((p) => p.videoUrl);
  return (
    (id && projects.find((p) => p.id === id)) ||
    withVideo.find((p) => p.featured && p.orientation === "vertical") ||
    withVideo.find((p) => p.orientation === "vertical") ||
    withVideo[0] ||
    null
  );
}

/** Types `text` in, one character at a time (instantly when disabled). */
export function useTypewriter(text: string, { delay = 0, cps = 38, enabled = true } = {}): number {
  const [n, setN] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      const id = requestAnimationFrame(() => setN(text.length));
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    let timer = 0;
    const step = () => {
      i++;
      setN(i);
      if (i < text.length) timer = window.setTimeout(step, 1000 / cps + (text[i - 1] === " " ? 30 : 0));
    };
    const start = window.setTimeout(() => {
      setN(0);
      step();
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
    };
  }, [text, delay, cps, enabled]);
  return n;
}

/** The two hero CTAs every variant shares. */
export function HeroCtas({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-6 ${className}`}>
      <Link
        href="/vertical-cuts"
        data-track="cta"
        data-track-id="hero_view_work"
        data-magnetic
        className="border border-fg px-7 py-3.5 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300 hover:bg-fg hover:text-bg"
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
    </div>
  );
}

/** Scroll progress through an element's own height minus one viewport (0 → 1), for sticky hero tracks. */
export function useTrackProgress(ref: RefObject<HTMLElement | null>, enabled = true): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      setP(Math.min(1, Math.max(0, -r.top / span)));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [ref, enabled]);
  return p;
}
