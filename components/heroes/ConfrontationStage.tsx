"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ConfrontationConfig, ConfrontState, HeroConfig, HeroPose } from "@/data/hero-config";
import { useNumbers, useText } from "@/lib/brand";
import { gasp } from "@/lib/sound";
import { cn } from "@/lib/utils";
import LensGlint from "./LensGlint";
import { isFrontal, poseMap } from "./shared";

/**
 * The Confrontation hero's figure: the user's portrait reacting to the
 * visitor. A small state machine picks a pose; poses crossfade as stacked
 * images (every reachable pose is preloaded), a WebGL glint rides the
 * lenses, and typographic overlays punctuate the expressions.
 *
 *   idle ─pointer moves→ tracking (head follows across the pose ladder)
 *   tracking ─pointer on him→ eyeContact (zoom) ─still N s→ smile (warm light)
 *   any ─click on him→ surprise (holds, then returns)
 *   pointer gone / idle N s → turnAway (drifts toward the frame edge)
 *   hero scrolls out → scoff (side-eye)
 *
 * `live={false}` (phones, reduced motion) renders the static pose only.
 */

export type StageState = ConfrontState | "tracking";

type Props = {
  hero: HeroConfig;
  config: ConfrontationConfig;
  live: boolean;
  /** Admin test area: pin a state. */
  forceState?: StageState | null;
  onStateChange?: (s: StageState, poseId: string) => void;
  className?: string;
};

/** Where on the stage he "is" — an ellipse around head + shoulders, as fractions. */
const FIGURE = { cx: 0.5, cy: 0.52, rx: 0.3, ry: 0.42 };

function ladderPose(hero: HeroConfig, x: number, y: number, sensitivity: number): HeroPose {
  const { ladder, up, down } = hero.poses;
  const gain = 0.6 + sensitivity * 1.4;
  const sx = Math.max(-1, Math.min(1, x * gain));
  if (Math.abs(sx) < 0.35 && y < -0.55) return up;
  if (Math.abs(sx) < 0.35 && y > 0.72) return down;
  const i = Math.round(((sx + 1) / 2) * (ladder.length - 1));
  return ladder[Math.max(0, Math.min(ladder.length - 1, i))];
}

export default function ConfrontationStage({ hero, config, live, forceState = null, onStateChange, className }: Props) {
  const num = useNumbers();
  const t = useText();
  const crossfade = num("confrontation.crossfade");
  const breath = num("confrontation.breathSeconds");
  const trackEase = num("confrontation.trackEase");
  const poses = useMemo(() => poseMap(hero), [hero]);
  const center = hero.poses.ladder[Math.floor(hero.poses.ladder.length / 2)];
  const stageRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [state, setState] = useState<StageState>("idle");
  const [track, setTrack] = useState<HeroPose>(center);
  const { behaviors: b, sensitivity: s } = config;

  // Live inputs the interval reads (kept in refs: pointer events must not re-render).
  const sig = useRef({ lastMove: 0, lastPresent: 0, over: false, overSince: 0, surpriseUntil: 0, away: false, raw: { x: 0, y: 0 } });

  useEffect(() => {
    if (!live) return;
    const stage = stageRef.current;
    if (!stage) return;
    const start = performance.now();
    sig.current.lastMove = start;
    sig.current.lastPresent = start;

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const now = performance.now();
      const over = ((fx - FIGURE.cx) / FIGURE.rx) ** 2 + ((fy - FIGURE.cy) / FIGURE.ry) ** 2 <= 1;
      const S = sig.current;
      if (over && !S.over) S.overSince = now;
      S.over = over;
      S.lastMove = now;
      S.lastPresent = now;
      S.raw = { x: (fx - 0.5) * 2, y: (fy - 0.5) * 2 };
    };
    const onLeave = () => {
      sig.current.over = false;
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      if (!sig.current.over || !b.surprise) return;
      sig.current.surpriseUntil = performance.now() + crossfade + s.surpriseHold;
      if (b.gaspSound) gasp();
    };
    const io = new IntersectionObserver(([en]) => {
      sig.current.away = en.intersectionRatio < 0.6;
    }, { threshold: [0, 0.3, 0.6, 0.9] });
    io.observe(stage);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    stage.addEventListener("pointerdown", onDown);

    // Smooth pointer for the glint + head choice.
    let raf = 0;
    const smooth = () => {
      raf = requestAnimationFrame(smooth);
      const p = pointer.current;
      p.x += (sig.current.raw.x - p.x) * trackEase;
      p.y += (sig.current.raw.y - p.y) * trackEase;
    };
    raf = requestAnimationFrame(smooth);

    const timer = window.setInterval(() => {
      const now = performance.now();
      const S = sig.current;
      let next: StageState;
      if (now < S.surpriseUntil) next = "surprise";
      else if (S.away && b.scoff) next = "scoff";
      else if (S.over && b.smile && now - S.lastMove > s.smileAfter * 1000) next = "smile";
      else if (S.over && b.eyeContact) next = "eyeContact";
      else if (b.turnAway && now - S.lastMove > s.turnAwayAfter * 1000) next = "turnAway";
      else if (b.tracking && now - S.lastMove < 60_000) next = "tracking";
      else next = "idle";
      setState(next);
      if (next === "tracking") setTrack(ladderPose(hero, pointer.current.x, pointer.current.y, s.tracking));
    }, 90);

    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("pointerdown", onDown);
    };
  }, [live, hero, b, s, crossfade, trackEase]);

  const shown: StageState = forceState ?? (live ? state : "idle");
  const pick = (id: string) => poses.get(id) ?? center;
  const pose: HeroPose = !live ? pick(config.poses.static) : shown === "tracking" ? (forceState ? center : track) : pick(config.poses[shown]);

  const report = useRef(onStateChange);
  useEffect(() => {
    report.current = onStateChange;
  }, [onStateChange]);
  useEffect(() => {
    report.current?.(shown, pose.id);
  }, [shown, pose.id]);

  // Every pose the machine can reach, stacked and preloaded.
  const stack = useMemo(() => {
    if (!live) return [poses.get(config.poses.static) ?? center];
    const ids = new Set<string>([...hero.poses.ladder.map((p) => p.id), hero.poses.up.id, hero.poses.down.id, ...Object.values(config.poses)]);
    return [...ids].map((id) => poses.get(id)).filter((p): p is HeroPose => Boolean(p));
  }, [live, hero, config.poses, poses, center]);

  const zoom = shown === "eyeContact" || shown === "smile" ? s.eyeContactZoom : shown === "surprise" ? s.eyeContactZoom + 0.02 : 1;
  const turned = shown === "turnAway";
  const offset = (p: HeroPose) => (p.offset ? `translate(${(p.offset[0] * 100).toFixed(2)}%, ${(-p.offset[1] * 100).toFixed(2)}%)` : undefined);

  return (
    <div
      ref={stageRef}
      className={cn("relative aspect-square select-none", live && b.surprise && "cursor-pointer", className)}
      style={{ "--xf": `${crossfade}ms`, "--breath": `${breath}s`, "--breath-amp": s.breathing } as CSSProperties}
    >
      {/* Warm key light while he smiles. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[-10%] transition-opacity duration-700"
        style={{ opacity: shown === "smile" ? 1 : 0, background: "radial-gradient(40% 38% at 50% 42%, rgb(255 186 110 / 0.22), transparent 72%)" }}
      />
      <div
        className="absolute inset-0 transition-transform ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          transform: turned ? "translateX(14%) scale(0.96)" : `scale(${zoom})`,
          transitionDuration: turned ? "2400ms" : "600ms",
          transformOrigin: "50% 60%",
          opacity: turned ? 0.82 : 1,
        }}
      >
        <div className={cn("absolute inset-0", live && b.breathing && "confront-breathe")}>
          {stack.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element -- stacked transparent stills crossfaded by opacity; next/image adds wrappers + srcsets for nothing here
            <img
              key={p.id}
              src={p.src}
              alt=""
              draggable={false}
              decoding="async"
              className="absolute inset-0 size-full object-contain object-bottom"
              style={{ opacity: p.id === pose.id ? 1 : 0, transition: "opacity var(--xf) linear", transform: offset(p) }}
            />
          ))}
          {live && b.eyeGlint && (
            <LensGlint
              className="pointer-events-none absolute inset-0 size-full"
              left={config.lenses.left}
              right={config.lenses.right}
              radius={config.lenses.radius}
              intensity={s.glint * (shown === "eyeContact" || shown === "smile" ? 1 : 0.65)}
              pointer={pointer}
              visible={isFrontal(pose, center.id)}
            />
          )}
        </div>
      </div>

      {live && b.overlays && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {shown === "smile" && <span className="confront-pop absolute left-[66%] top-[16%] text-3xl text-accent">✦</span>}
          {shown === "surprise" && <span className="confront-pop type-display absolute left-[68%] top-[12%] text-7xl text-accent">!</span>}
          {shown === "scoff" && <span className="confront-pop absolute left-[64%] top-[18%] font-mono text-sm uppercase tracking-widest text-muted">{t("hero.confrontation.scoff")}</span>}
          {shown === "turnAway" && <span className="confront-pop absolute left-[20%] top-[22%] font-mono text-[11px] uppercase tracking-widest text-muted">{t("hero.confrontation.comeBack")}</span>}
        </div>
      )}
    </div>
  );
}
