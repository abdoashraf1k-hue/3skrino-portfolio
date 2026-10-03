"use client";

import { scrollToTarget } from "@/lib/scroll";
import { useSectionProgress } from "@/lib/sections";
import { cn, pad } from "@/lib/utils";

const R = 19;
const C = 2 * Math.PI * R;

/**
 * Appears past 50% of the page: a ring that fills with reading progress
 * around the current section's number — which morphs into an "↑" on hover.
 * Click to glide back to the top.
 */
export default function ScrollTop() {
  const { sections, active, page } = useSectionProgress();
  const shown = page > 0.5;
  const label = active >= 0 && sections[active] ? sections[active].label : "Top";

  return (
    <button
      type="button"
      onClick={() => scrollToTarget(0)}
      aria-label="Back to top"
      title={`${label} — back to top`}
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      className={cn(
        "group fixed bottom-5 right-5 z-40 flex size-12 items-center justify-center rounded-full bg-bg/70 backdrop-blur transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:bottom-8 md:right-8",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={R} fill="none" stroke="currentColor" strokeWidth="1" className="text-fg/15" />
        <circle
          cx="22"
          cy="22"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - page)}
          className="text-accent transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <span className="relative h-4 overflow-hidden font-mono text-[10px] leading-4 tabular-nums">
        <span className="flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-4 group-focus-visible:-translate-y-4">
          <span className="h-4 text-fg/80">{active >= 0 ? pad(active + 1) : "↑"}</span>
          <span className="h-4 text-accent">↑</span>
        </span>
      </span>
    </button>
  );
}
