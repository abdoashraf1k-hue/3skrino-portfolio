"use client";

import { useId } from "react";
import { OPEN_PALETTE } from "@/components/ui/CommandPalette";
import { toggleTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const iconBtn =
  "flex size-8 items-center justify-center rounded-full text-muted transition-colors duration-300 hover:bg-fg/[0.06] hover:text-fg";

/** Search (opens the command palette) + sun/moon theme toggle. */
export default function NavTools({ className }: { className?: string }) {
  const theme = useTheme();
  const light = theme === "light";
  // Rendered twice (desktop + mobile bar); ids must not collide.
  const maskId = `moon-bite-${useId().replace(/:/g, "")}`;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))}
        aria-label="Search (Ctrl or Command + K)"
        title="Search · Ctrl/⌘ K"
        className={iconBtn}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
        aria-pressed={light}
        title={light ? "Dark theme" : "Light theme"}
        className={iconBtn}
      >
        {/* Sun ↔ moon: one svg, the "bite" circle slides in over the disc. */}
        <svg viewBox="0 0 24 24" className="size-4 overflow-visible" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <mask id={maskId}>
            <rect x="-4" y="-4" width="32" height="32" fill="white" />
            <circle
              cx={light ? 24 : 16}
              cy={light ? 0 : 8}
              r="6"
              fill="black"
              className="transition-[cx,cy] duration-500 ease-out motion-reduce:transition-none"
            />
          </mask>
          <circle cx="12" cy="12" r={light ? 4.5 : 7} fill="currentColor" mask={`url(#${maskId})`} className="transition-[r] duration-500 ease-out motion-reduce:transition-none" />
          <g className={cn("origin-center transition-[opacity,transform] duration-500 motion-reduce:transition-none", light ? "rotate-0 opacity-100" : "-rotate-45 opacity-0")}>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <path key={a} d="M12 2.2v2.3" transform={`rotate(${a} 12 12)`} />
            ))}
          </g>
        </svg>
      </button>
    </div>
  );
}
