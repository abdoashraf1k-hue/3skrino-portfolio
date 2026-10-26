"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SequenceFrame } from "@/data/hero-config";
import { cn } from "@/lib/utils";
import { heroSpin } from "@/store/heroStore";

/**
 * The 360° hero: a frame-by-frame turn of real photos, drawn on a Canvas 2D.
 * Every frame is fetched and decoded up front (to an ImageBitmap where the
 * browser can), so scrubbing never waits on the network or the decoder.
 *
 * Frames are placed by their head yaw (Sprint 14), sorted and de-duplicated,
 * and the pointer drives an *angle*, not an index: a sequence with frames
 * bunched near the face (AI fill-ins) still turns at an even speed.
 * Mouse: X across `trackRef` maps the lowest angle (far left) to the highest
 * (far right). Touch: a horizontal drag turns the head — around the full
 * circle when the sequence closes it — while vertical swipes still scroll.
 * The angle eases towards the target (exponential lerp), so the turn has
 * weight and steps through every frame in between instead of jumping. The
 * rAF loop only runs while it is still settling. It starts facing you (0°).
 */

type Frame = ImageBitmap | HTMLImageElement;

const PRELOAD_CONCURRENCY = 6;
/** Lerp stiffness: higher follows the pointer more tightly. */
const STIFFNESS = 7;
/** One full turn per this fraction of the stage width, when dragging. */
const DRAG_TURN = 0.9;
/** Frames closer than this (degrees) are duplicates: the first one wins. */
const SAME_ANGLE = 0.5;

/** Sorted by angle, duplicates dropped. */
function orderFrames(frames: SequenceFrame[]): SequenceFrame[] {
  const out: SequenceFrame[] = [];
  for (const f of [...frames].sort((a, b) => a.angle - b.angle)) {
    const last = out.at(-1);
    if (!last || f.angle - last.angle >= SAME_ANGLE) out.push(f);
  }
  return out;
}

/** Index of the angle nearest `deg` in an ascending list (circular: across the ±180 seam too). */
function nearest(angles: number[], deg: number, circular: boolean): number {
  const n = angles.length;
  const a = circular ? ((((deg + 180) % 360) + 360) % 360) - 180 : deg;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (angles[mid] < a) lo = mid + 1;
    else hi = mid;
  }
  const dist = (i: number) => {
    const d = Math.abs(angles[i] - a);
    return circular ? Math.min(d, 360 - d) : d;
  };
  let best = lo;
  // The neighbour below, and across the seam the far end of the list.
  for (const i of circular ? [lo - 1, 0, n - 1] : [lo - 1]) if (i >= 0 && dist(i) < dist(best)) best = i;
  return best;
}

async function loadFrame(src: string): Promise<Frame> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  // A bitmap is GPU-ready: drawImage() never re-decodes it.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(img);
    } catch {
      /* fall back to the decoded <img> */
    }
  }
  return img;
}

/** Loads every frame (a few at a time), reporting progress. Frames that fail are dropped; `urls` are the ones that made it. */
function usePreload(images: string[]) {
  const [state, setState] = useState<{ key: string; loaded: number; frames: Frame[] | null; urls: string[] }>({ key: "", loaded: 0, frames: null, urls: [] });
  // The array's contents are its identity: a new array with the same URLs doesn't reload.
  const key = images.join("\n");
  const urls = useMemo(() => (key ? key.split("\n") : []), [key]);

  useEffect(() => {
    if (!urls.length) return;
    let cancelled = false;
    const out: (Frame | null)[] = new Array(urls.length).fill(null);
    let next = 0;
    let loaded = 0;
    const worker = async () => {
      while (!cancelled && next < urls.length) {
        const i = next++;
        try {
          out[i] = await loadFrame(urls[i]);
        } catch {
          console.warn(`[hero] 360° frame ${i + 1} failed to load: ${urls[i]}`);
        }
        loaded++;
        if (!cancelled) setState((s) => ({ ...s, key, loaded }));
      }
    };
    void Promise.all(Array.from({ length: Math.min(PRELOAD_CONCURRENCY, urls.length) }, worker)).then(() => {
      if (cancelled) return;
      const ok = urls.filter((_, i) => out[i] !== null);
      setState({ key, loaded, frames: out.filter((f): f is Frame => f !== null), urls: ok });
    });
    return () => {
      cancelled = true;
      for (const f of out) if (f && "close" in f) f.close();
    };
  }, [key, urls]);

  const current = state.key === key;
  return { loaded: current ? state.loaded : 0, frames: current ? state.frames : null, urls: current ? state.urls : [] };
}

type Props = {
  frames: SequenceFrame[];
  /** Shown while the sequence loads, and instead of it when there is none. */
  fallbackSrc: string;
  /** Where the pointer is tracked (the whole hero, so the turn follows the mouse anywhere on it). */
  trackRef: RefObject<HTMLElement | null>;
  reducedMotion: boolean;
  /** "pointer: coarse" — picks the hint. */
  coarse: boolean;
};

export default function ImageSequenceHero({ frames: input, fallbackSrc, trackRef, reducedMotion, coarse }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ordered = useMemo(() => orderFrames(input), [input]);
  const images = useMemo(() => ordered.map((f) => f.url), [ordered]);
  const { loaded, frames, urls: loadedUrls } = usePreload(images);
  // Angles of the frames that loaded, from the current config (an angle edit needs no reload).
  const loadedAngles = useMemo(() => {
    const byUrl = new Map(ordered.map((f) => [f.url, f.angle]));
    return frames ? loadedUrls.map((u) => byUrl.get(u) ?? 0) : null;
  }, [ordered, frames, loadedUrls]);
  const ready = Boolean(frames?.length);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!frames?.length || !loadedAngles || !canvas || !track) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const n = frames.length;
    const angles = loadedAngles;
    const lo = angles[0];
    const hi = angles[n - 1];
    // A closed turn: the seam between the last and first frame is no wider than a normal step.
    const circular = n >= 3 && 360 - (hi - lo) <= Math.max(30, 2 * (360 / n));
    const clamp = (a: number) => (circular ? a : Math.min(hi, Math.max(lo, a)));

    let target = clamp(0);
    let pos = target;
    let drawn = -1;
    let raf = 0;
    let last = 0;

    const draw = (force = false) => {
      const idx = nearest(angles, pos, circular);
      if (idx === drawn && !force) return;
      drawn = idx;
      const f = frames[idx];
      const { width: cw, height: ch } = canvas;
      const s = Math.min(cw / f.width, ch / f.height);
      const w = f.width * s;
      const h = f.height * s;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(f, (cw - w) / 2, (ch - h) / 2, w, h);
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      pos += (target - pos) * (reducedMotion ? 1 : 1 - Math.exp(-STIFFNESS * dt));
      if (Math.abs(target - pos) < 0.05) pos = target;
      heroSpin.angle = (pos * Math.PI) / 180;
      draw();
      raf = pos === target ? 0 : requestAnimationFrame(tick);
    };
    const kick = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };

    // Backing store at device resolution (capped at 2×), redrawn on resize.
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.imageSmoothingQuality = "high";
      draw(true);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let dragX: number | null = null;
    const onMove = (e: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      if (e.pointerType === "touch") {
        if (dragX === null) return;
        target = clamp(target + ((e.clientX - dragX) / (rect.width * DRAG_TURN)) * 360);
        dragX = e.clientX;
      } else {
        const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        target = lo + x * (hi - lo);
        // A mouse after a touch drag: bring the wrapped angle back into [lo, hi] the short way.
        if (circular) pos -= Math.round((pos - target) / 360) * 360;
      }
      setTouched(true);
      kick();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") dragX = e.clientX;
    };
    const onUp = () => {
      dragX = null;
    };
    track.addEventListener("pointermove", onMove, { passive: true });
    track.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      heroSpin.angle = 0;
    };
  }, [frames, loadedAngles, trackRef, reducedMotion]);

  const total = images.length;
  const pct = total ? Math.round((loaded / total) * 100) : 0;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* The portrait's box: centred, clear of the nav, its bottom under the copy's scrim. */}
      <div className="absolute inset-x-0 top-[5%] h-[86%]">
        {/* The still: the only image without a sequence, the placeholder while one loads. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded URLs on any host */}
        <img
          src={fallbackSrc}
          alt=""
          aria-hidden
          draggable={false}
          className={cn("absolute inset-0 size-full object-contain transition-opacity duration-700", ready ? "opacity-0" : "opacity-100")}
        />
        {total > 0 && (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="360° portrait — move the mouse or drag to turn it"
            className={cn("absolute inset-0 size-full transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}
          />
        )}
      </div>

      <div className="absolute right-4 top-24 z-30 font-mono text-[10px] uppercase tracking-widest text-muted md:right-8">
        {total > 0 && !ready && (
          <div className="flex w-40 flex-col items-end gap-2" role="status">
            <span>Loading 360° · {pct}%</span>
            <span className="h-px w-full overflow-hidden bg-line">
              <span className="block h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </span>
          </div>
        )}
        {ready && (
          <p aria-hidden className={cn("text-right transition-opacity duration-700", touched ? "opacity-40" : "opacity-100")}>
            {coarse ? "⟷ Drag to rotate 360°" : "Move mouse to rotate 360°"}
          </p>
        )}
      </div>
    </div>
  );
}
