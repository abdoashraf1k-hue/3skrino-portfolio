"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import BentoGrid from "@/components/ui/BentoGrid";
import Placeholder from "@/components/ui/Placeholder";
import ProjectBadges from "@/components/ui/ProjectBadges";
import type { Reel } from "@/data/projects";
import { cn } from "@/lib/utils";

/** Desktop-class pointer with motion allowed — gates hover previews. */
const HOVER_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const canHover = () => typeof window !== "undefined" && window.matchMedia(HOVER_QUERY).matches;

type Props = {
  reels: Reel[];
  /** Opens the in-page player. Without it, tiles link to the /reels player instead. */
  onOpen?: (index: number) => void;
};

/** Reels as a bento mosaic (tilt + glare come from BentoGrid); clips preview on hover. */
export default function BentoReels({ reels, onOpen }: Props) {
  return (
    <BentoGrid
      gap={5}
      tileClassName="rounded-lg"
      items={reels.map((reel, i) => ({
        id: reel.id,
        // No hint: reels follow the grid's bento rhythm, with the first one 2×2.
        node: <ReelTile reel={reel} index={i} big={i % 8 === 0} onOpen={onOpen && (() => onOpen(i))} />,
      }))}
    />
  );
}

function ReelTile({ reel, index, big, onOpen }: { reel: Reel; index: number; big: boolean; onOpen?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // The <video> mounts on first hover only, so the grid never preloads clips.
  const [previewMounted, setPreviewMounted] = useState(false);
  const [playing, setPlaying] = useState(false);

  const onEnter = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || !canHover() || !reel.videoUrl) return;
    if (!previewMounted) setPreviewMounted(true);
    else void videoRef.current?.play().catch(() => undefined);
  };
  const onLeave = () => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      setPlaying(false);
    }
  };

  const body: ReactNode = (
    <>
      <Placeholder
        title={reel.title}
        seed={index + 2}
        size={big ? "lg" : "sm"}
        image={reel.poster || undefined}
        sizes={big ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"}
      />

      {previewMounted && reel.videoUrl && (
        <video
          ref={videoRef}
          src={reel.videoUrl}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-500",
            playing ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 font-mono text-[10px] uppercase tracking-widest text-muted">
        <span className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full bg-accent-2", playing && "animate-pulse")} />
          Reel {String(index + 1).padStart(2, "0")}
        </span>
        <span>{reel.duration}</span>
      </div>

      {!reel.videoUrl && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="flex size-14 items-center justify-center rounded-full border border-fg/40 bg-bg/40 text-xs backdrop-blur">▶</span>
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-bg/85 to-transparent p-4 pt-16 md:p-5 md:pt-20">
        <ProjectBadges filmed={reel.filmed} directed={reel.directed} edited={reel.edited} className="mb-2" />
        <h3 className={cn("font-black uppercase tracking-tight", big ? "text-2xl md:text-4xl" : "text-lg")}>{reel.title}</h3>
        <p className="mt-1 flex justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted">
          <span className="truncate">{reel.client}</span>
          <span className="shrink-0">▶ {reel.views} views</span>
        </p>
      </div>
    </>
  );

  const cls = "group relative block size-full overflow-hidden bg-bg-soft text-left outline-offset-4";
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} onPointerEnter={onEnter} onPointerLeave={onLeave} aria-label={`Play ${reel.title}`} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <Link href={`/reels?view=player&reel=${reel.id}`} onPointerEnter={onEnter} onPointerLeave={onLeave} aria-label={`Play ${reel.title}`} className={cls}>
      {body}
    </Link>
  );
}
