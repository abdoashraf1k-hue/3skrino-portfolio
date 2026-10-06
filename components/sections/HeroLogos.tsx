"use client";

import Image from "next/image";
import { useEffect, useRef, type MouseEvent } from "react";
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

type Props = { logos: BrandLogo[]; reducedMotion: boolean; /** Whole-ring size multiplier (admin → Brands). */ scale?: number };

/**
 * Brand logos floating around the hero silhouette. A DOM layer (not WebGL)
 * so they're crisp, hoverable and focusable over a canvas that ignores the
 * pointer. The whole ring yaws / pitches opposite the pointer; each logo
 * drifts on its own CSS loop. Hover / click brighten the silhouette's rim
 * via heroSignals. Clicks never navigate — just a pulse.
 */
export default function HeroLogos({ logos, reducedMotion, scale = 1 }: Props) {
  const ringRef = useRef<HTMLDivElement>(null);
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

  const pulse = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
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
          <li key={logo.id}>{logo.name}</li>
        ))}
      </ul>
      {/* Decorative: clicks never navigate, so the buttons stay out of the tab order. */}
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
                <button
                  type="button"
                  onClick={pulse}
                  onPointerEnter={() => {
                    heroSignals.hover += 1;
                  }}
                  onPointerLeave={() => {
                    heroSignals.hover = Math.max(0, heroSignals.hover - 1);
                  }}
                  tabIndex={-1}
                  title={logo.name}
                  className="pointer-events-auto block cursor-pointer rounded-full transition-[transform,opacity] duration-300 ease-out hover:scale-110 hover:!opacity-100 motion-reduce:transition-none"
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
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
