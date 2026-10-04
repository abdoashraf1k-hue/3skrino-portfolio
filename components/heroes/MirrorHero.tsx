"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import SafeBoundary from "@/components/three/SafeBoundary";
import { site } from "@/data/site";
import { RICH_MOTION_QUERY, useMediaQuery } from "@/lib/hooks";
import { useHeroConfig, useSiteConfig } from "@/lib/live-config";
import { cn } from "@/lib/utils";
import { HeroCtas, heroPoses, useTrackProgress } from "./shared";

const MirrorScene = dynamic(() => import("@/components/three/MirrorScene"), { ssr: false });

/** In heroPoses() order (up, ladder ×7, down) the resting centre pose is index 4. */
const CENTRE = 4;

/** Mirror i's starting pose: the other poses spread evenly across the arc. */
function initialSlots(total: number, mirrors: number): number[] {
  const others = Array.from({ length: total }, (_, i) => i).filter((i) => i !== CENTRE);
  return Array.from({ length: mirrors }, (_, i) => others[Math.round((i * (others.length - 1)) / Math.max(1, mirrors - 1))]);
}

/**
 * Hero 5 — Mirror / Reflection. The silhouette stands in a semicircle of
 * mirrors; each holds a different pose, echoing back into itself. The room
 * turns with the pointer; hovering a mirror swaps its pose with the one in
 * the centre, clicking freezes the room (click again to release); scrolling
 * fades the mirrors out one by one. Phones / reduced motion / no WebGL: a
 * still arc of mirrors (hover still swaps).
 */
export default function MirrorHero() {
  const config = useHeroConfig();
  const { content, cinematic } = useSiteConfig();
  const poses = useMemo(() => heroPoses(config), [config]);
  const count = cinematic?.heroOptions.mirrorCount ?? 7;
  const rich = useMediaQuery(RICH_MOTION_QUERY);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [centre, setCentre] = useState(CENTRE);
  const [slots, setSlots] = useState(() => initialSlots(poses.length, count));
  const [frozen, setFrozen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const progress = useTrackProgress(sectionRef, rich);
  const live = rich && !failed;

  // Mirror count changed in the admin → re-deal the poses.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setSlots(initialSlots(poses.length, count));
      setCentre(CENTRE);
    });
    return () => cancelAnimationFrame(id);
  }, [count, poses.length]);

  // The hovered mirror's pose steps into the centre; the centre's pose takes its place in the glass.
  const swap = (i: number) => {
    if (frozen || slots[i] === undefined) return;
    const next = [...slots];
    next[i] = centre;
    setSlots(next);
    setCentre(slots[i]);
  };

  return (
    <section id="home" ref={sectionRef} className={cn("relative bg-[#060606]", live ? "h-[200svh]" : "min-h-svh")}>
      <div className={cn("relative overflow-hidden", live ? "sticky top-0 h-svh" : "min-h-svh")}>
        {!(live && ready) && <StillMirrors poses={poses} slots={slots} centre={centre} onSwap={swap} interactive={!live} />}
        {live && (
          <div className={cn("absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}>
            <SafeBoundary onError={() => setFailed(true)}>
              <MirrorScene
                poses={poses}
                slots={slots}
                centre={centre}
                frozen={frozen}
                progress={progress}
                onHoverMirror={swap}
                onClickMirror={() => setFrozen((f) => !f)}
                onReady={() => setReady(true)}
              />
            </SafeBoundary>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-6 pb-12 text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/45">
            {frozen ? `Frozen on ${poses[centre]?.label} — click a mirror to release` : live ? "Move to turn the room · hover a mirror · click to freeze" : "Hover a mirror"}
          </p>
          <h1 className="type-display mt-4 text-[clamp(3.6rem,12vw,11rem)] leading-[0.85] text-white/95">{site.name}</h1>
          <p className="mt-4 max-w-xl text-base leading-snug text-white/60 md:text-lg">{content.tagline}</p>
          <div className="pointer-events-auto">
            <HeroCtas className="mt-8 justify-center" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** The still fallback: mirror panes in an arc, reflected on the floor. */
function StillMirrors({
  poses,
  slots,
  centre,
  onSwap,
  interactive,
}: {
  poses: ReturnType<typeof heroPoses>;
  slots: number[];
  centre: number;
  onSwap: (i: number) => void;
  interactive: boolean;
}) {
  const n = slots.length;
  const pane = (src: string, className: string) => (
    <span className={cn("relative block", className)}>
      <Image src={src} alt="" fill sizes="20vw" unoptimized={src.startsWith("http")} className="object-contain object-bottom opacity-80 brightness-[2.4] grayscale" />
    </span>
  );
  return (
    <div className="absolute inset-0 overflow-hidden [perspective:1200px]">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,#141414,#060606_75%)]" />
      <div className="absolute inset-x-0 top-[12%] flex h-[52%] items-end justify-center gap-[1.2vw] px-4">
        {slots.map((poseIndex, i) => {
          const a = (i - (n - 1) / 2) / Math.max(1, (n - 1) / 2); // -1 … 1
          return (
            <button
              key={i}
              type="button"
              tabIndex={interactive ? 0 : -1}
              aria-label={`Show ${poses[poseIndex]?.label}`}
              onMouseEnter={() => interactive && onSwap(i)}
              onFocus={() => interactive && onSwap(i)}
              className="relative h-full w-[11vw] max-w-36 min-w-12 overflow-hidden border border-white/15 bg-gradient-to-b from-[#1b1b1b] to-[#0d0d0d]"
              style={{ transform: `rotateY(${a * -38}deg) translateZ(${-Math.abs(a) * 120}px)` }}
            >
              {poses[poseIndex] && pane(poses[poseIndex].src, "absolute inset-x-0 bottom-0 h-[92%]")}
              <span className="absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.08)_48%,transparent_60%)]" />
            </button>
          );
        })}
      </div>
      {/* The real one */}
      <div className="pointer-events-none absolute bottom-[26%] left-1/2 aspect-square h-[46%] -translate-x-1/2">
        {poses[centre] && (
          <Image src={poses[centre].src} alt="" fill sizes="40vh" priority unoptimized={poses[centre].src.startsWith("http")} className="object-contain object-bottom [filter:brightness(0.15)_drop-shadow(0_-1px_0_rgb(255_255_255/0.7))_drop-shadow(0_0_14px_rgb(255_255_255/0.2))]" />
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-b from-transparent via-[#060606]/80 to-[#060606]" />
    </div>
  );
}
