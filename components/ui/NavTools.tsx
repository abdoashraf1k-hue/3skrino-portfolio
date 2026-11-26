"use client";

import { OPEN_PALETTE } from "@/components/ui/CommandPalette";
import { toggleAmbientMuted, useAmbientAvailable, useAmbientMuted } from "@/lib/hero-ambient";
import { cn } from "@/lib/utils";

const iconBtn =
  "flex size-8 items-center justify-center rounded-full text-muted transition-colors duration-300 hover:bg-fg/[0.06] hover:text-fg";

/** Search (opens the command palette) + hero ambient mute (when it's on the page). */
export default function NavTools({ className }: { className?: string }) {
  const ambient = useAmbientAvailable();
  const muted = useAmbientMuted();

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {ambient && (
        <button
          type="button"
          onClick={toggleAmbientMuted}
          aria-label={muted ? "Unmute ambient sound" : "Mute ambient sound"}
          aria-pressed={!muted}
          title={muted ? "Sound off" : "Sound on"}
          className={iconBtn}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
            {muted ? (
              <path d="m16 9.5 5 5m0-5-5 5" />
            ) : (
              <>
                <path d="M15.5 9a4 4 0 0 1 0 6" />
                <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
              </>
            )}
          </svg>
        </button>
      )}
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
    </div>
  );
}
