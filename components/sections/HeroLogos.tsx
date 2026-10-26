"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { brandHref, buildBrands } from "@/data/brands";
import { LOGO_SIZE, type BrandLogo } from "@/data/hero-config";
import { useNumbers } from "@/lib/brand";
import { heroSignals } from "@/lib/hero-signals";

/**
 * Slot i of n on two side arcs (left / right of the silhouette), skipping the
 * top and bottom so logos never sit on the name or the CTAs. Returns
 * percentages of the stage plus a depth in -1…1.
 */
function slot(i: number, n: number) {
  const side = i % 2 === 0 ? -1 : 1;
  const perSide = Math.ceil(n / 2);
  const k = Math.floor(i / 2);
  const t = perSide === 1 ? 0.5 : k / (perSide - 1);
  // -55° … +55° around each side's horizontal, a little staggered between sides.
  const angle = (-55 + t * 110 + (side > 0 ? 9 : -6)) * (Math.PI / 180);
  // Kept inside ~10–90%: translateZ + perspective push near logos outward by up to ~15%.
  const x = 50 + side * (26 + 6 * Math.cos(angle) + (k % 2) * 3);
  const y = 46 - 33 * Math.sin(angle);
  const z = Math.sin(i * 2.399 + 0.7); // golden-angle scatter, stable per index
  return { x, y, z };
}

/** The automatic slot, unless the logo was placed by hand (admin → Brands → Place). */
function place(logo: BrandLogo, i: number, n: number) {
  const auto = slot(i, n);
  return {
    x: logo.x ?? auto.x,
    y: logo.y ?? auto.y,
    z: logo.depth ?? auto.z,
    angle: logo.angle ?? 0,
  };
}

type Props = {
  logos: BrandLogo[];
  reducedMotion: boolean;
  /** Whole-ring size multiplier (admin → Brands). */
  scale?: number;
  /** False in admin previews: every logo renders inert, so nothing navigates away from the admin. */
  linkable?: boolean;
};

/**
 * Brand logos floating around the hero silhouette. A DOM layer (not WebGL)
 * so they're crisp, hoverable and focusable over a canvas that ignores the
 * pointer. The whole ring yaws / pitches opposite the pointer; each logo
 * drifts on its own CSS loop. Hover / click brighten the silhouette's rim
 * via heroSignals.
 *
 * Sprint 13: a brand with projects (project.brandId) is a link to
 * /reels?brand=<id>; a brand without any stays visible but inert (default
 * cursor, no link, no hover lift). The visual ring is aria-hidden, so the
 * screen-reader list carries the real, focusable links.
 */
export default function HeroLogos({ logos, reducedMotion, scale = 1, linkable = true }: Props) {
  const ringRef = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => new Map(buildBrands(logos).map((b) => [b.id, b.projectIds.length])), [logos]);
  // Ring tilt (deg) opposite the pointer, its smoothing per frame, and the depth spread — admin → Numbers.
  const num = useNumbers();
  const yaw = num("logos.tiltYaw");
  const pitch = num("logos.tiltPitch");
  const ease = num("logos.tiltEase");
  const depth = num("logos.depth");

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring || reducedMotion) return;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const tick = () => {
      cur.x += (target.x - cur.x) * ease;
      cur.y += (target.y - cur.y) * ease;
      ring.style.transform = `rotateY(${(-cur.x * yaw).toFixed(3)}deg) rotateX(${(-cur.y * pitch).toFixed(3)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reducedMotion, yaw, pitch, ease]);

  // A hovered logo that unmounts must not leave the rim stuck bright.
  useEffect(
    () => () => {
      heroSignals.hover = 0;
    },
    [],
  );

  if (!logos.length) return null;

  const pulse = (e: MouseEvent<HTMLElement>) => {
    heroSignals.pulseAt = performance.now();
    if (reducedMotion) return;
    e.currentTarget.animate(
      [
        { transform: "scale(1.1)", filter: "brightness(1)" },
        { transform: "scale(1.32)", filter: "brightness(1.8) drop-shadow(0 0 14px rgb(231 254 85 / 0.7))" },
        { transform: "scale(1.1)", filter: "brightness(1)" },
      ],
      { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  };

  return (
    <div className="pointer-events-none absolute inset-0 hidden [perspective:1100px] md:block">
      <ul className="sr-only" aria-label="Selected clients">
        {logos.map((logo) => (
          <li key={logo.id}>
            {linkable && counts.get(logo.id) ? <Link href={brandHref(logo.id)}>{`${logo.name} — view their work`}</Link> : logo.name}
          </li>
        ))}
      </ul>
      {/* The visual ring: out of the a11y tree and tab order — the list above has the links. */}
      <div ref={ringRef} aria-hidden className="absolute inset-0 [transform-style:preserve-3d]">
        {logos.map((logo, i) => {
          const { x, y, z, angle } = place(logo, i, logos.length);
          const size = Math.round(Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, logo.size ?? 56)) * Math.min(4, Math.max(0.25, scale)));
          const opacity = 0.5 + ((z + 1) / 2) * 0.4; // far → 0.5, near → 0.9
          return (
            <div
              key={logo.id}
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) translateZ(${(z * depth).toFixed(1)}px) rotate(${angle}deg)`,
              }}
            >
              <div
                className="hero-logo"
                style={{
                  animationDelay: `${1.4 + i * 0.08}s, ${-i * 1.7}s`,
                  animationDuration: `0.9s, ${9 + (i % 4) * 2.2}s`,
                }}
              >
                <LogoMark
                  href={linkable && counts.get(logo.id) ? brandHref(logo.id) : null}
                  name={logo.name}
                  onPulse={pulse}
                  style={{ width: size, height: size, opacity }}
                >
                  <Image
                    src={logo.imageUrl}
                    alt=""
                    width={size}
                    height={size}
                    unoptimized
                    draggable={false}
                    className="size-full select-none object-contain"
                  />
                </LogoMark>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const hover = {
  onPointerEnter: () => {
    heroSignals.hover += 1;
  },
  onPointerLeave: () => {
    heroSignals.hover = Math.max(0, heroSignals.hover - 1);
  },
};

/**
 * One logo: a link (pointer cursor, hover lift, a pulse as it navigates) when
 * the brand has projects to show, else an inert mark that still answers the
 * rim light on hover but has no cursor change and no click.
 */
function LogoMark({
  href,
  name,
  onPulse,
  style,
  children,
}: {
  href: string | null;
  name: string;
  onPulse: (e: MouseEvent<HTMLElement>) => void;
  style: CSSProperties;
  children: ReactNode;
}) {
  if (href) {
    return (
      <Link
        href={href}
        onClick={onPulse}
        {...hover}
        tabIndex={-1}
        title={`${name} — view their work`}
        className="pointer-events-auto block cursor-pointer rounded-full transition-[transform,opacity,filter] duration-300 ease-out hover:scale-110 hover:!opacity-100 hover:drop-shadow-[0_0_14px_rgb(231_254_85/0.45)] motion-reduce:transition-none"
        style={style}
      >
        {children}
      </Link>
    );
  }
  return (
    <span {...hover} title={name} className="pointer-events-auto block cursor-default rounded-full" style={style}>
      {children}
    </span>
  );
}
