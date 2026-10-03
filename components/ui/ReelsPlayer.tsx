"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import Placeholder from "@/components/ui/Placeholder";
import ProjectBadges from "@/components/ui/ProjectBadges";
import type { Reel } from "@/data/projects";
import { trackVideoPlay } from "@/lib/analytics";
import { cn, EASE_OUT } from "@/lib/utils";

type Props = {
  reels: Reel[];
  start: number;
  onIndex: (index: number) => void;
  onClose: () => void;
};

const seconds = (d: string) => d.split(":").reduce((acc, n) => acc * 60 + Number(n), 0) || 15;

function Icon({ d, filled = false }: { d: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const HEART = "M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.8 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.5 0 5.6 3.5 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z";
const SHARE = "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13";
const SOUND_ON = "M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13";
const SOUND_OFF = "M11 5 6 9H3v6h3l5 4V5zM22 9l-6 6M16 9l6 6";

/**
 * TikTok-style vertical player. One reel per full-height slide with CSS
 * scroll-snap; the slide in view autoplays (real footage when a reel has
 * `videoUrl`, a timed placeholder otherwise) and advances at the end.
 * ↑/↓ (or j/k) navigate, space pauses, m mutes, Esc closes.
 */
export default function ReelsPlayer({ reels, start, onIndex, onClose }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [index, setIndex] = useState(start);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [shared, setShared] = useState<string | null>(null);
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(reels.length - 1, i));
      scroller.current?.children[next]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    },
    [reels.length, reduced],
  );

  // Jump to the starting reel without animation, lock the page behind.
  useEffect(() => {
    scroller.current?.children[start]?.scrollIntoView({ block: "start" });
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [start]);

  // Which slide is on screen?
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            setIndex(i);
            setProgress(0);
            setPaused(reduced);
          }
        }
      },
      { root, threshold: 0.6 },
    );
    Array.from(root.children).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => onIndex(index), [index, onIndex]);

  // Play only the active slide.
  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (!v) return;
      if (i === index && !paused) {
        v.muted = muted;
        void v.play().catch(() => setPaused(true));
      } else {
        v.pause();
        if (i !== index) v.currentTime = 0;
      }
    });
  }, [index, paused, muted]);

  // Placeholder slides "play" on a timer so progress + auto-advance still work.
  const reel = reels[index];
  useEffect(() => {
    if (!reel || reel.videoUrl || paused) return;
    const total = seconds(reel.duration) * 1000;
    let last = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const dt = t - last;
      last = t;
      setProgress((p) => {
        const next = Math.min(1, p + dt / total);
        if (next >= 1) window.setTimeout(() => go(index + 1), 0);
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reel, paused, index, go]);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowdown", "arrowright", "j"].includes(k)) {
        e.preventDefault();
        go(index + 1);
      } else if (["arrowup", "arrowleft", "k"].includes(k)) {
        e.preventDefault();
        go(index - 1);
      } else if (k === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (k === "m") {
        setMuted((m) => !m);
      } else if (k === "escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, onClose]);

  const share = async (r: Reel) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "player");
    url.searchParams.set("reel", r.id);
    try {
      if (navigator.share) await navigator.share({ title: `${r.title} — 3SKRINO`, url: url.href });
      else {
        await navigator.clipboard.writeText(url.href);
        setShared(r.id);
        window.setTimeout(() => setShared(null), 1600);
      }
    } catch {
      // user cancelled the share sheet
    }
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Reels player"
      data-lenis-prevent
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      className="fixed inset-0 z-[80] bg-black text-white"
    >
      {/* Story-style progress: done / current / upcoming */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-3 md:mx-auto md:max-w-[calc(100svh*9/16)]">
        {reels.map((r, i) => (
          <span key={r.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
            <span
              className="block h-full origin-left bg-white"
              style={{ transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})` }}
            />
          </span>
        ))}
      </div>

      <div className="absolute inset-x-0 top-6 z-20 flex items-center justify-between px-4 font-mono text-[10px] uppercase tracking-widest text-white/70">
        <span>
          {String(index + 1).padStart(2, "0")} / {String(reels.length).padStart(2, "0")}
        </span>
        <button type="button" onClick={onClose} className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur hover:bg-white/20">
          Grid <span aria-hidden className="text-base leading-none">×</span>
        </button>
      </div>

      <div ref={scroller} className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none]">
        {reels.map((r, i) => {
          const isLiked = liked.has(r.id);
          return (
            <section key={r.id} data-index={i} aria-label={r.title} className="relative flex h-full snap-start snap-always items-center justify-center">
              <div
                className="relative h-full w-full overflow-hidden md:h-[calc(100svh-2rem)] md:w-auto md:rounded-xl md:aspect-[9/16]"
                onClick={() => setPaused((p) => !p)}
              >
                {r.videoUrl ? (
                  <video
                    ref={(el) => {
                      videos.current[i] = el;
                    }}
                    src={Math.abs(i - index) <= 1 ? r.videoUrl : undefined}
                    poster={r.poster}
                    playsInline
                    muted={muted}
                    preload="metadata"
                    onTimeUpdate={(e) => i === index && setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
                    onPlay={() => trackVideoPlay(`reel:${r.id}`)}
                    onEnded={() => go(i + 1)}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <Placeholder title={r.title} seed={i + 2} size="lg" />
                )}

                {paused && i === index && (
                  <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-16 items-center justify-center rounded-full bg-black/40 text-lg backdrop-blur">▶</span>
                  </span>
                )}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/30 to-transparent p-5 pb-8 pr-20 pt-24">
                  <ProjectBadges filmed={r.filmed} directed={r.directed} edited={r.edited} className="mb-3" />
                  <p className="type-display text-4xl leading-none">{r.title}</p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-white/60">
                    {r.client} · {r.duration} · ▶ {r.views}
                  </p>
                </div>

                {/* Action rail */}
                <div className="absolute bottom-8 right-3 flex flex-col items-center gap-5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    aria-pressed={isLiked}
                    aria-label={isLiked ? "Unlike" : "Like"}
                    onClick={() =>
                      setLiked((s) => {
                        const next = new Set(s);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    className={cn("flex flex-col items-center gap-1 transition-transform active:scale-90", isLiked ? "text-[#ff2d55]" : "text-white")}
                  >
                    <Icon d={HEART} filled={isLiked} />
                    <span className="font-mono text-[9px] uppercase tracking-widest">{isLiked ? "Liked" : "Like"}</span>
                  </button>
                  <button type="button" aria-label="Share" onClick={() => void share(r)} className="flex flex-col items-center gap-1">
                    <Icon d={SHARE} />
                    <span className="font-mono text-[9px] uppercase tracking-widest">{shared === r.id ? "Copied" : "Share"}</span>
                  </button>
                  {r.videoUrl && (
                    <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)} className="flex flex-col items-center gap-1">
                      <Icon d={muted ? SOUND_OFF : SOUND_ON} />
                      <span className="font-mono text-[9px] uppercase tracking-widest">{muted ? "Muted" : "Sound"}</span>
                    </button>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 font-mono text-[9px] uppercase tracking-widest text-white/40 md:block">
        ↑ ↓ navigate · space pause · m mute · esc grid
      </p>
    </motion.div>
  );
}
