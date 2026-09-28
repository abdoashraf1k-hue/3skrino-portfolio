"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const FPS = 25;

const two = (n: number) => String(n).padStart(2, "0");

/** SMPTE-style timecode. `fields` 4 → HH:MM:SS:FF, 3 → MM:SS:FF. */
export function formatTimecode(ms: number, fields: 3 | 4 = 4): string {
  const totalFrames = Math.floor((ms / 1000) * FPS);
  const ff = totalFrames % FPS;
  const totalSeconds = Math.floor(totalFrames / FPS);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return fields === 4 ? `${two(hh)}:${two(mm)}:${two(ss)}:${two(ff)}` : `${two(mm)}:${two(ss)}:${two(ff)}`;
}

type TimecodeProps = {
  /** When false the counter freezes and resets to zero. */
  running?: boolean;
  fields?: 3 | 4;
  className?: string;
  style?: CSSProperties;
};

/**
 * Counts up from 00:00:00:00 while `running`. Writes straight to the DOM
 * each frame so it never re-renders React at 25fps.
 */
export default function Timecode({ running = true, fields = 4, className, style }: TimecodeProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!running) {
      el.textContent = formatTimecode(0, fields);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      el.textContent = formatTimecode(now - start, fields);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, fields]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)} style={style}>
      {formatTimecode(0, fields)}
    </span>
  );
}
