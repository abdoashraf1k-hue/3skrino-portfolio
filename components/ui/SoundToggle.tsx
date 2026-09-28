"use client";

import { useSyncExternalStore } from "react";
import { getMuted, getMutedServer, subscribeSound, toggleMuted } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Speaker toggle — sound is off by default. Click sounds live in TransitionProvider. */
export default function SoundToggle({ className }: { className?: string }) {
  const muted = useSyncExternalStore(subscribeSound, getMuted, getMutedServer);

  return (
    <button
      type="button"
      data-sound-toggle
      onClick={toggleMuted}
      aria-pressed={!muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      className={cn(
        "flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors duration-300",
        muted ? "text-muted hover:text-fg" : "text-accent",
        className,
      )}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor" />
        {muted ? (
          <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.2" />
        ) : (
          <>
            <path d="M10.5 5.5a3.5 3.5 0 010 5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M12.5 3.5a6.5 6.5 0 010 9" stroke="currentColor" strokeWidth="1.2" />
          </>
        )}
      </svg>
      <span className="hidden lg:inline">{muted ? "Off" : "On"}</span>
    </button>
  );
}
