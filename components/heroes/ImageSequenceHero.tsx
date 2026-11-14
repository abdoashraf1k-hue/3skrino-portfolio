"use client";

import { motion, useMotionValue, useMotionValueEvent, useSpring, useTransform } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { SequenceFrame } from "@/data/hero-config";
import { matteBlackBackdrop } from "@/lib/backdrop-matte";
import { sameOriginMedia } from "@/lib/media-url";
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
 *
 * Gaze (Sprint 15): on top of the turn, the portrait tilts towards the cursor
 * anywhere on the page — X → rotateY, Y → rotateX (±15°) on springs, under a
 * CSS perspective — and the WebGL orbit tilts with it (heroSpin.tiltX/Y).
 * Mouse and pen only; touch keeps the drag-to-turn, reduced motion keeps still.
 */

export type Frame = ImageBitmap | HTMLImageElement;

const PRELOAD_CONCURRENCY = 6;
/**
 * Sprint 15.5 calibration: the cursor across the window, nx ∈ [-1, 1], maps
 * linearly to a target yaw of nx × 180° (+ the admin's calibration offset):
 * 10% of the half-width right of centre is +18°, the edges are ±180°. The
 * angle then eases toward it by lerp(current, target, 0.1) per 60 fps frame —
 * applied frame-rate-independently as 1 − 0.9^(dt·60).
 */
const MOUSE_RANGE = 180;
const LERP = 0.1;
/** Arrow keys: one press turns this far (image-zoom-360: a keyboard alternative to dragging). */
const KEY_STEP = 5;
/** One full turn per this fraction of the stage width, when dragging. */
const DRAG_TURN = 0.9;
/** Gaze tilt at the edge of the stage, degrees. */
const TILT = 15;
/** Gaze parallax shift at the edge of the stage, px. */
const SHIFT_X = 14;
const SHIFT_Y = 10;
/** Soft and weighted: the head follows, it doesn't snap. */
const GAZE_SPRING = { stiffness: 50, damping: 20, mass: 1 };
/** Where the face sits in the stage's height (the portrait box is 5% → 91%). */
const FACE_Y = 0.42;

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));

/** Is the stage on screen at all? (Window-level listeners skip work while it's scrolled away.) */
const onScreen = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight;

/**
 * The cursor anywhere on the page → spring-smoothed tilt / shift of the portrait.
 * Leaving the window (or a touch screen, or reduced motion) eases back to centre.
 */
function useGaze(trackRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, GAZE_SPRING);
  const sy = useSpring(my, GAZE_SPRING);
  const rotateY = useTransform(sx, [-1, 1], [-TILT, TILT]);
  // Cursor above the face → the head tips back (looks up).
  const rotateX = useTransform(sy, [-1, 1], [TILT, -TILT]);
  const x = useTransform(sx, [-1, 1], [-SHIFT_X, SHIFT_X]);
  const y = useTransform(sy, [-1, 1], [-SHIFT_Y, SHIFT_Y]);

  // The WebGL orbit / hologram read these inside useFrame: they tilt with the head.
  useMotionValueEvent(rotateX, "change", (v) => {
    heroSpin.tiltX = (v * Math.PI) / 180;
  });
  useMotionValueEvent(rotateY, "change", (v) => {
    heroSpin.tiltY = (v * Math.PI) / 180;
  });
  useMotionValueEvent(x, "change", (v) => {
    heroSpin.shiftX = v;
  });
  useMotionValueEvent(y, "change", (v) => {
    heroSpin.shiftY = v;
  });

  useEffect(() => {
    if (!enabled) {
      mx.set(0);
      my.set(0);
      return;
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = trackRef.current?.getBoundingClientRect();
      if (!r || !onScreen(r)) return;
      mx.set(clamp1((e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      my.set(clamp1((e.clientY - (r.top + r.height * FACE_Y)) / (r.height / 2)));
    };
    const onLeave = () => {
      mx.set(0);
      my.set(0);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [enabled, trackRef, mx, my]);

  return { rotateX, rotateY, x, y };
}

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

/** Frames that loaded without CORS (tainted): drawable on a Canvas 2D, but WebGL may not sample them. */
const tainted = new WeakSet<Frame>();

async function decodeImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  const img = new Image();
  // Sprint 15.5: CORS, so the hologram shader may upload the pixels (the bucket answers with CORS headers).
  if (cors) img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.src = sameOriginMedia(src);
  await img.decode();
  return img;
}

async function loadFrame(src: string, matte: boolean): Promise<Frame> {
  let img: HTMLImageElement;
  let clean = true;
  try {
    img = await decodeImage(src, true);
  } catch {
    // A host without CORS headers: load it the old way — it still draws, just not through WebGL.
    img = await decodeImage(src, false);
    clean = false;
  }
  const mark = (f: Frame) => {
    if (!clean) tainted.add(f);
    return f;
  };
  // Sprint 15.5: a black studio backdrop becomes transparent (connectivity matte — dark skin / hair stay solid).
  // Needs CORS-clean pixels; a tainted frame keeps its backdrop.
  if (matte && clean) {
    const matted = matteBlackBackdrop(img, img.naturalWidth, img.naturalHeight);
    if (matted) {
      if (typeof createImageBitmap === "function") {
        try {
          return await createImageBitmap(matted);
        } catch {
          /* fall through to the original */
        }
      }
    }
  }
  // A bitmap is GPU-ready: drawImage() never re-decodes it.
  if (typeof createImageBitmap === "function") {
    try {
      return mark(await createImageBitmap(img));
    } catch {
      /* fall back to the decoded <img> */
    }
  }
  return mark(img);
}

/** Loads every frame (a few at a time), reporting progress. Frames that fail are dropped; `urls` are the ones that made it. */
function usePreload(images: string[], matte: boolean) {
  const [state, setState] = useState<{ key: string; loaded: number; frames: Frame[] | null; urls: string[] }>({ key: "", loaded: 0, frames: null, urls: [] });
  // The array's contents are its identity: a new array with the same URLs doesn't reload.
  const key = images.join("\n");
  const urls = useMemo(() => (key ? key.split("\n") : []), [key]);

  // The loaded state belongs to these URLs *and* this matte setting (toggling it reloads).
  const stateKey = `${matte ? 1 : 0}|${key}`;

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
          out[i] = await loadFrame(urls[i], matte);
        } catch {
          console.warn(`[hero] 360° frame ${i + 1} failed to load: ${urls[i]}`);
        }
        loaded++;
        if (!cancelled) setState((s) => ({ ...s, key: stateKey, loaded }));
      }
    };
    void Promise.all(Array.from({ length: Math.min(PRELOAD_CONCURRENCY, urls.length) }, worker)).then(() => {
      if (cancelled) return;
      const ok = urls.filter((_, i) => out[i] !== null);
      setState({ key: stateKey, loaded, frames: out.filter((f): f is Frame => f !== null), urls: ok });
    });
    return () => {
      cancelled = true;
      for (const f of out) if (f && "close" in f) f.close();
    };
  }, [stateKey, urls, matte]);

  const current = state.key === stateKey;
  return { loaded: current ? state.loaded : 0, frames: current ? state.frames : null, urls: current ? state.urls : [] };
}

/** What the sequence reports up: drawable or not, safe for WebGL, and the decoded frames (for GPU pre-upload). */
export type SequenceState = { ready: boolean; webgl: boolean; frames: readonly Frame[] | null };

type Props = {
  frames: SequenceFrame[];
  /** Shown while the sequence loads, and instead of it when there is none. */
  fallbackSrc: string;
  /** Where the pointer is tracked (the whole hero, so the turn follows the mouse anywhere on it). */
  trackRef: RefObject<HTMLElement | null>;
  reducedMotion: boolean;
  /** "pointer: coarse" — picks the hint. */
  coarse: boolean;
  /** Sprint 15.5: degrees added to the mouse's nx × 180 target (admin → Genesis → Calibration). */
  calibrationOffset?: number;
  /** Sprint 15.5: make a black photo backdrop transparent at load (connectivity matte — see lib/backdrop-matte). */
  matteBackdrop?: boolean;
  /** Keep drawing, but don't show the canvas: a WebGL pass (the Genesis hologram) samples and draws it instead. */
  hideCanvas?: boolean;
  /**
   * Fires when the sequence becomes drawable or goes away. `webgl`: every
   * loaded frame came with CORS, so a WebGL pass may sample it.
   */
  onReadyChange?: (state: SequenceState) => void;
};

export default function ImageSequenceHero({
  frames: input,
  fallbackSrc,
  trackRef,
  reducedMotion,
  coarse,
  calibrationOffset = 0,
  hideCanvas = false,
  matteBackdrop = false,
  onReadyChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ordered = useMemo(() => orderFrames(input), [input]);
  const images = useMemo(() => ordered.map((f) => f.url), [ordered]);
  const { loaded, frames, urls: loadedUrls } = usePreload(images, matteBackdrop);
  // Angles of the frames that loaded, from the current config (an angle edit needs no reload).
  const loadedAngles = useMemo(() => {
    const byUrl = new Map(ordered.map((f) => [f.url, f.angle]));
    return frames ? loadedUrls.map((u) => byUrl.get(u) ?? 0) : null;
  }, [ordered, frames, loadedUrls]);
  const ready = Boolean(frames?.length);
  const [touched, setTouched] = useState(false);
  const gaze = useGaze(trackRef, !reducedMotion && !coarse);

  // Hidden while WebGL draws the head; un-hiding repaints immediately.
  const hiddenRef = useRef(hideCanvas);
  const redraw = useRef<(() => void) | null>(null);
  useEffect(() => {
    hiddenRef.current = hideCanvas;
    if (!hideCanvas) redraw.current?.();
  }, [hideCanvas]);

  // Live calibration: the pointer handler reads the latest offset without re-binding (or reloading frames).
  const offsetRef = useRef(calibrationOffset);
  const retarget = useRef<(() => void) | null>(null);
  useEffect(() => {
    offsetRef.current = calibrationOffset;
    retarget.current?.();
  }, [calibrationOffset]);

  const webglSafe = Boolean(frames?.length && frames.every((f) => !tainted.has(f)));
  useEffect(() => {
    onReadyChange?.({ ready, webgl: webglSafe, frames: ready ? frames : null });
  }, [ready, webglSafe, frames, onReadyChange]);

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

    // Facing you at rest — through the calibration, so the centred cursor and the first frame agree.
    let target = clamp(offsetRef.current);
    let pos = target;
    let lastNx = 0;
    let drawn = -1;
    let raf = 0;
    let last = 0;

    const draw = (force = false) => {
      const idx = nearest(angles, pos, circular);
      if (idx === drawn && !force) return;
      drawn = idx;
      const f = frames[idx];
      heroSpin.frame = f;
      heroSpin.version++;
      // A WebGL pass draws the head: skip the (invisible) 2D redraw — it's the expensive part of a frame change.
      if (hiddenRef.current) return;
      const { width: cw, height: ch } = canvas;
      const s = Math.min(cw / f.width, ch / f.height);
      const w = f.width * s;
      const h = f.height * s;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(f, (cw - w) / 2, (ch - h) / 2, w, h);
    };
    // Shown again (cutout mode, a WebGL failure): paint the current frame at once.
    redraw.current = () => draw(true);

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      // lerp(pos, target, 0.1) per 60 fps frame, the same feel at any refresh rate.
      pos += (target - pos) * (reducedMotion ? 1 : 1 - Math.pow(1 - LERP, dt * 60));
      if (Math.abs(target - pos) < 0.05) pos = target;
      heroSpin.angle = (pos * Math.PI) / 180;
      // The settled yaw, for QA / assistive tooling (written only while the turn is moving).
      canvas.dataset.angle = pos.toFixed(1);
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

    /** nx ∈ [-1, 1] → nx × 180° + calibration (clamped to the frames when the turn isn't closed). */
    const aim = (nx: number) => {
      lastNx = nx;
      target = clamp(nx * MOUSE_RANGE + offsetRef.current);
      // Coming from a wrapped angle (touch drag, keys): close the gap the short way round.
      if (circular) pos -= Math.round((pos - target) / 360) * 360;
      kick();
    };
    // A new calibration offset re-aims at once, from where the cursor last was.
    retarget.current = () => aim(lastNx);

    let dragX: number | null = null;
    // Window-level: the turn follows the mouse anywhere on the page.
    const onMove = (e: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      if (!onScreen(rect)) return;
      if (e.pointerType === "touch") {
        if (dragX === null) return;
        target = clamp(target + ((e.clientX - dragX) / (rect.width * DRAG_TURN)) * 360);
        dragX = e.clientX;
        kick();
      } else {
        aim(Math.min(1, Math.max(-1, (e.clientX / window.innerWidth) * 2 - 1)));
      }
      setTouched(true);
    };
    // ← / → turn the head while the hero is on screen and nothing else has focus.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const el = document.activeElement;
      if (el && el !== document.body && el !== track && !track.contains(el)) return;
      if (!onScreen(track.getBoundingClientRect())) return;
      target = clamp(target + (e.key === "ArrowRight" ? KEY_STEP : -KEY_STEP));
      setTouched(true);
      kick();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") dragX = e.clientX;
    };
    const onUp = () => {
      dragX = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    track.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("keydown", onKey);
    kick(); // settle on the calibrated rest angle

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      retarget.current = null;
      redraw.current = null;
      // The frames are closed when the sequence unloads: never leave a closed bitmap for WebGL to upload.
      if (heroSpin.frame && frames.includes(heroSpin.frame)) {
        heroSpin.frame = null;
        heroSpin.version++;
      }
      heroSpin.angle = 0;
    };
  }, [frames, loadedAngles, trackRef, reducedMotion]);

  const total = images.length;
  const pct = total ? Math.round((loaded / total) * 100) : 0;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* The portrait's box: centred, clear of the nav, its bottom under the copy's scrim. Perspective for the gaze tilt. */}
      <div className="absolute inset-x-0 top-[5%] h-[86%] [perspective:1100px]">
        {/* Transforms only (rotate / translate on the compositor): no layout or paint per frame. */}
        <motion.div
          className="absolute inset-0 origin-[50%_42%] will-change-transform [transform-style:preserve-3d]"
          style={{ rotateX: gaze.rotateX, rotateY: gaze.rotateY, x: gaze.x, y: gaze.y }}
        >
          {/* The still: the only image without a sequence, the placeholder while one loads. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded URLs on any host */}
          <img
            src={sameOriginMedia(fallbackSrc)}
            alt=""
            aria-hidden
            draggable={false}
            className={cn("absolute inset-0 size-full object-contain transition-opacity duration-700", ready ? "opacity-0" : "opacity-100")}
          />
          {total > 0 && (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label="360° portrait — move the mouse, drag, or use the arrow keys to turn it"
              className={cn("absolute inset-0 size-full transition-opacity duration-700", ready && !hideCanvas ? "opacity-100" : "opacity-0")}
            />
          )}
        </motion.div>
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
