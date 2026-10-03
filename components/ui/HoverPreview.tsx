"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Desktop-class pointer with motion allowed — gates hover previews. */
const HOVER_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

/**
 * Muted, looping clip that plays while the enclosing card is hovered. Drop it
 * inside a card's media box: it listens on its closest link / button, mounts
 * the <video> on the first hover only (grids never preload clips) and fades
 * in once frames are actually playing.
 */
export default function HoverPreview({ src, className }: { src: string; className?: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const card = hostRef.current?.closest<HTMLElement>("a, button");
    if (!card || !src) return;
    let hovering = false;
    const enter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !window.matchMedia(HOVER_QUERY).matches) return;
      hovering = true;
      setMounted(true);
      void videoRef.current?.play().catch(() => undefined);
    };
    const leave = () => {
      hovering = false;
      videoRef.current?.pause();
    };
    // A first hover mounts the video — it starts itself (autoPlay) unless the pointer already left.
    const onCanPlay = () => {
      if (!hovering) videoRef.current?.pause();
    };
    card.addEventListener("pointerenter", enter);
    card.addEventListener("pointerleave", leave);
    const v = videoRef.current;
    v?.addEventListener("canplay", onCanPlay);
    return () => {
      card.removeEventListener("pointerenter", enter);
      card.removeEventListener("pointerleave", leave);
      v?.removeEventListener("canplay", onCanPlay);
    };
  }, [src, mounted]);

  return (
    <span ref={hostRef} aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {mounted && (
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className={cn("size-full object-cover transition-opacity duration-500", playing ? "opacity-100" : "opacity-0")}
        />
      )}
    </span>
  );
}
