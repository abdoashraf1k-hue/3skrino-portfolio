"use client";

import { motion, motionValue, useSpring, type MotionValue } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { brandHref, buildBrands } from "@/data/brands";
import { LOGO_SIZE, type BrandLogo, type GenesisGravity } from "@/data/hero-config";
import { heroSignals } from "@/lib/hero-signals";
import { sameOriginMedia } from "@/lib/media-url";
import { cn } from "@/lib/utils";

/**
 * Sprint 15 — the Genesis hero's brand constellation.
 *
 * Layout (pure, deterministic, recomputed on resize):
 *   1. Seed: a Vogel / golden-angle spiral (θ = i·137.5°, r ∝ √i) laid on an
 *      elliptical annulus around the face; each logo's depth comes from the
 *      matching point of a Fibonacci sphere (z = 1 − 2(i+½)/n).
 *   2. Relax: a few passes of pairwise separation (no two logos overlap),
 *      projection out of the face ellipse (inflated by each logo's radius)
 *      and clamping to the safe band (clear of the nav and the copy).
 * Logos placed by hand (admin → Brands → Place) start at their spot and are
 * only nudged when they'd cover the face.
 *
 * Magnetic gravity: one window pointer listener computes, per logo, a
 * Gaussian-falloff push away from (repel) or pull toward (attract) the
 * cursor and writes it to that logo's motion values; framer-motion springs
 * smooth it. framer-motion has no `useMouse`, so the pointer is read
 * directly — no React render per move.
 */

/** Face exclusion: centre as fractions of the stage, radii as fractions of its height (the portrait box is height-bound). */
const FACE = { x: 0.5, y: 0.37, rx: 0.27, ry: 0.34 };
/** At most this share of the free band may be covered by logos; past it every logo shrinks to fit. */
const FILL = 0.5;
/** Safe band for logo centres: below the nav, above the copy. */
const BAND = { top: 0.13, bottom: 0.7, side: 0.06 };
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const GAP = 24;
const SPRING = { stiffness: 90, damping: 16, mass: 0.6 };

type Placed = { x: number; y: number; z: number; r: number };

function sizeOf(logo: BrandLogo, scale: number) {
  return Math.round(Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, logo.size ?? 56)) * Math.min(4, Math.max(0.25, scale)));
}

/** Pushes a point out of the face ellipse (inflated by `pad`) along its ray from the centre. */
function outOfFace(p: { x: number; y: number }, W: number, H: number, pad: number) {
  const cx = FACE.x * W;
  const cy = FACE.y * H;
  const rx = FACE.rx * H + pad;
  const ry = FACE.ry * H + pad;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const k = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  if (k >= 1) return;
  if (k < 1e-6) {
    p.x = cx + rx;
    return;
  }
  const s = 1 / Math.sqrt(k);
  p.x = cx + dx * s;
  p.y = cy + dy * s;
}

export function layoutLogos(logos: BrandLogo[], W: number, H: number, scale: number): Placed[] {
  const n = logos.length;
  if (!n || W < 1 || H < 1) return [];
  const cx = FACE.x * W;
  const cy = FACE.y * H;
  // Auto-fit: the free band (minus the face) can only hold so much — shrink every logo evenly when the set is too big.
  const free = W * (1 - 2 * BAND.side) * H * (BAND.bottom - BAND.top + 0.1) - Math.PI * FACE.rx * H * FACE.ry * H;
  const need = logos.reduce((s, l) => s + (sizeOf(l, scale) + GAP) ** 2, 0);
  const fit = Math.min(1, Math.sqrt((FILL * Math.max(free, 1)) / Math.max(need, 1)));
  const pts = logos.map((logo, i) => {
    const r = (sizeOf(logo, scale) * fit) / 2;
    // Fibonacci sphere: an even spread of depths, stable per index.
    const z = 1 - (2 * (i + 0.5)) / n;
    if (logo.x !== undefined && logo.y !== undefined) return { x: (logo.x / 100) * W, y: (logo.y / 100) * H, z: logo.depth ?? z, r, fixed: true };
    // Vogel spiral on an annulus: t ∈ (0,1] → from just outside the face to the stage edge.
    const t = Math.sqrt((i + 0.5) / n);
    const theta = i * GOLDEN + 0.35;
    const inner = 1.25;
    const outer = Math.max(inner + 0.4, Math.min(W / (2 * FACE.rx * H), 3.6));
    const k = inner + t * (outer - inner);
    return { x: cx + Math.cos(theta) * FACE.rx * H * k, y: cy + Math.sin(theta) * FACE.ry * H * k * 0.75, z: logo.depth ?? z, r, fixed: false };
  });

  const clampBand = (p: (typeof pts)[number]) => {
    p.x = Math.min(W * (1 - BAND.side) - p.r, Math.max(W * BAND.side + p.r, p.x));
    p.y = Math.min(H * BAND.bottom, Math.max(H * BAND.top, p.y));
  };

  for (let pass = 0; pass < 40; pass++) {
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const A = pts[a];
        const B = pts[b];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = A.r + B.r + GAP;
        if (d >= min) continue;
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        // Hand-placed logos hold their ground; the automatic one takes the whole move.
        const wa = A.fixed ? 0 : B.fixed ? 2 : 1;
        const wb = B.fixed ? 0 : A.fixed ? 2 : 1;
        A.x -= ux * push * wa;
        A.y -= uy * push * wa;
        B.x += ux * push * wb;
        B.y += uy * push * wb;
      }
    }
    for (const p of pts) {
      if (!p.fixed) clampBand(p);
      outOfFace(p, W, H, p.r + GAP);
    }
  }
  return pts.map(({ x, y, z, r }) => ({ x, y, z, r }));
}

type Force = { x: MotionValue<number>; y: MotionValue<number> };

type Props = {
  logos: BrandLogo[];
  reducedMotion: boolean;
  scale?: number;
  gravity: GenesisGravity;
  /** 0–1. */
  strength: number;
  /** False in admin previews: nothing navigates away. */
  linkable?: boolean;
};

export default function OrbitalLogos({ logos, reducedMotion, scale = 1, gravity, strength, linkable = true }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const counts = useMemo(() => new Map(buildBrands(logos).map((b) => [b.id, b.projectIds.length])), [logos]);
  const placed = useMemo(() => layoutLogos(logos, box.w, box.h, scale), [logos, box.w, box.h, scale]);
  // One pair of motion values per logo, created outside render-phase hooks so the pointer loop can write them.
  const ids = logos.map((l) => l.id).join("|");
  const forces = useMemo<Force[]>(() => logos.map(() => ({ x: motionValue(0), y: motionValue(0) })), [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Magnetic gravity.
  useEffect(() => {
    const el = boxRef.current;
    const reset = () => forces.forEach((f) => (f.x.set(0), f.y.set(0)));
    if (!el || gravity === "off" || reducedMotion || !placed.length) {
      reset();
      return;
    }
    const sign = gravity === "repel" ? -1 : 1;
    const radius = 240 + strength * 160;
    const maxPush = 30 + strength * 110;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        const dx = mx - p.x;
        const dy = my - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const fall = Math.exp(-((d / radius) ** 2));
        // Attraction never overshoots the cursor.
        const mag = Math.min(maxPush * fall, sign > 0 ? d * 0.55 : Infinity);
        forces[i].x.set((dx / d) * mag * sign);
        forces[i].y.set((dy / d) * mag * sign);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", reset);
    };
  }, [gravity, strength, reducedMotion, placed, forces]);

  useEffect(
    () => () => {
      heroSignals.hover = 0;
    },
    [],
  );

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0 hidden md:block">
      <ul className="sr-only" aria-label="Selected clients">
        {logos.map((logo) => (
          <li key={logo.id}>{linkable && counts.get(logo.id) ? <Link href={brandHref(logo.id)}>{`${logo.name} — view their work`}</Link> : logo.name}</li>
        ))}
      </ul>
      <div aria-hidden>
        {placed.length === logos.length &&
          logos.map((logo, i) => (
            <Orb
              key={logo.id}
              logo={logo}
              index={i}
              at={placed[i]}
              force={forces[i]}
              href={linkable && counts.get(logo.id) ? brandHref(logo.id) : null}
            />
          ))}
      </div>
    </div>
  );
}

function Orb({ logo, index, at, force, href }: { logo: BrandLogo; index: number; at: Placed; force: Force; href: string | null }) {
  const x = useSpring(force.x, SPRING);
  const y = useSpring(force.y, SPRING);
  const size = at.r * 2;
  // Near logos brighter and a touch larger: the Fibonacci-sphere depth.
  const depth = (at.z + 1) / 2;
  const style: CSSProperties = { width: size, height: size, opacity: 0.55 + depth * 0.4 };

  const body = <Shape logo={logo} size={size} />;
  const hover = {
    onPointerEnter: () => {
      heroSignals.hover += 1;
    },
    onPointerLeave: () => {
      heroSignals.hover = Math.max(0, heroSignals.hover - 1);
    },
  };

  return (
    <motion.div className="absolute left-0 top-0" style={{ x, y, left: at.x, top: at.y }}>
      <div className="-translate-x-1/2 -translate-y-1/2" style={{ scale: 0.88 + depth * 0.16 }}>
        <div className="hero-logo" style={{ animationDelay: `${1.2 + index * 0.08}s, ${-index * 1.7}s`, animationDuration: `0.9s, ${9 + (index % 4) * 2.2}s` }}>
          {href ? (
            <Link
              href={href}
              tabIndex={-1}
              title={`${logo.name} — view their work`}
              onClick={() => {
                heroSignals.pulseAt = performance.now();
              }}
              {...hover}
              className="genesis-orb pointer-events-auto block cursor-pointer transition-[transform,opacity,filter] duration-300 ease-out hover:scale-110 hover:!opacity-100 motion-reduce:transition-none"
              style={style}
            >
              {body}
            </Link>
          ) : (
            <span {...hover} title={logo.name} className="genesis-orb pointer-events-auto block cursor-default" style={style}>
              {body}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Img({ src, className }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logos on any host
  return <img src={sameOriginMedia(src)} alt="" draggable={false} className={cn("select-none object-contain", className)} />;
}

/** The brand's frame: plain, a neon diamond or circle (clip-path), or its name as glitch text. */
function Shape({ logo, size }: { logo: BrandLogo; size: number }): ReactNode {
  switch (logo.shape) {
    case "diamond":
      return (
        <span className="genesis-shape-glow relative block size-full">
          <span className="genesis-diamond absolute inset-0 block" style={{ background: "linear-gradient(135deg, var(--g-glow), var(--g-accent))" }} />
          <span className="genesis-diamond absolute inset-[2px] block" style={{ background: "color-mix(in srgb, var(--g-bg) 82%, transparent)" }} />
          <Img src={logo.imageUrl} className="absolute inset-[27%] size-[46%]" />
        </span>
      );
    case "circle":
      return (
        <span
          className="relative block size-full rounded-full border-[1.5px]"
          style={{
            borderColor: "var(--g-glow)",
            background: "radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--g-tint) 30%, transparent), color-mix(in srgb, var(--g-bg) 85%, transparent) 70%)",
            boxShadow: "0 0 18px color-mix(in srgb, var(--g-glow) 55%, transparent), inset 0 0 14px color-mix(in srgb, var(--g-glow) 30%, transparent)",
          }}
        >
          <Img src={logo.imageUrl} className="absolute inset-[18%] size-[64%] rounded-full" />
        </span>
      );
    case "glitch-text":
      return (
        <span className="flex size-full items-center justify-center">
          <span className="genesis-glitch type-display whitespace-nowrap uppercase leading-none" data-text={logo.name} style={{ fontSize: Math.max(12, size * 0.24) }}>
            {logo.name}
          </span>
        </span>
      );
    default:
      return <Img src={logo.imageUrl} className="size-full" />;
  }
}
