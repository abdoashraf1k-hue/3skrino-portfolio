import type { CSSProperties } from "react";
import type { CinematicConfig, CursorSize } from "@/data/site-config";
import { colorCss } from "@/lib/cinematic";
import { cn } from "@/lib/utils";

export const CURSOR_SCALE: Record<CursorSize, number> = { sm: 0.72, md: 1, lg: 1.4 };
/** The ring box at size "md" (px) — the pre-Sprint-10 cursor's ring. */
export const CURSOR_BOX = 48;

type Cursor = CinematicConfig["cursor"];

/**
 * The cursor's ring layer for every style (admin → Cursor Studio). Must sit
 * inside an element with the `group` class whose data-mode="hover" | "default"
 * drives the hover state — the site cursor flips it on the DOM (no re-render),
 * the admin test area through React.
 */
export default function CursorShape({ cursor }: { cursor: Cursor }) {
  const box = CURSOR_BOX * CURSOR_SCALE[cursor.size];
  const style = {
    width: box,
    height: box,
    "--cur": colorCss(cursor.color),
    "--cur-h": colorCss(cursor.hover.color),
    "--cur-s": cursor.hover.scale,
  } as CSSProperties;
  const ease = "transition-[transform,opacity,color,filter] duration-200 ease-out";
  const tint = "[color:var(--cur)] group-data-[mode=hover]:[color:var(--cur-h)]";
  const glow = cursor.hover.glow && "group-data-[mode=hover]:[filter:drop-shadow(0_0_6px_currentColor)_drop-shadow(0_0_14px_currentColor)]";

  let shape;
  switch (cursor.style) {
    case "dot":
      // The original: an invisible ring that blooms over anything interactive.
      shape = (
        <span
          className={cn(
            "block size-full scale-50 rounded-full border border-current opacity-0 group-data-[mode=hover]:opacity-100 group-data-[mode=hover]:[transform:scale(var(--cur-s))]",
            ease,
          )}
        />
      );
      break;
    case "ring":
      shape = (
        <span
          className={cn(
            "block size-full scale-[0.6] rounded-full border border-current opacity-70 group-data-[mode=hover]:bg-current/10 group-data-[mode=hover]:opacity-100 group-data-[mode=hover]:[transform:scale(var(--cur-s))]",
            ease,
          )}
        />
      );
      break;
    case "crosshair":
      shape = (
        <span className={cn("relative block size-full scale-[0.6] group-data-[mode=hover]:[transform:rotate(45deg)_scale(var(--cur-s))]", ease)}>
          <span className="absolute left-1/2 top-0 h-[35%] w-px -translate-x-1/2 bg-current" />
          <span className="absolute bottom-0 left-1/2 h-[35%] w-px -translate-x-1/2 bg-current" />
          <span className="absolute left-0 top-1/2 h-px w-[35%] -translate-y-1/2 bg-current" />
          <span className="absolute right-0 top-1/2 h-px w-[35%] -translate-y-1/2 bg-current" />
        </span>
      );
      break;
    case "playhead":
      // An editor's playhead: a hairline with a wedge head.
      shape = (
        <span className={cn("relative block size-full origin-center group-data-[mode=hover]:[transform:scaleY(calc(var(--cur-s)*1.15))]", ease)}>
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current" />
          <svg viewBox="0 0 12 10" className="absolute left-1/2 top-0 w-[30%] -translate-x-1/2" aria-hidden>
            <path d="M0 0h12v4L6 10 0 4z" fill="currentColor" />
          </svg>
        </span>
      );
      break;
    case "aperture":
      // Six blades; they open and turn over interactive things.
      shape = (
        <svg
          viewBox="-50 -50 100 100"
          aria-hidden
          className={cn("block size-full scale-[0.7] group-data-[mode=hover]:[transform:rotate(60deg)_scale(var(--cur-s))]", ease)}
        >
          <circle r="46" fill="none" stroke="currentColor" strokeWidth="3" />
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d="M0 -44 L22 -6 L8 0 Z" fill="currentColor" fillOpacity="0.55" transform={`rotate(${i * 60})`} />
          ))}
        </svg>
      );
      break;
  }

  return (
    <span aria-hidden className={cn("block", tint, glow)} style={style}>
      {shape}
    </span>
  );
}
