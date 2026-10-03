"use client";

import { scrollToTarget } from "@/lib/scroll";
import { useSectionProgress } from "@/lib/sections";
import { cn, pad } from "@/lib/utils";

/**
 * A thin vertical rail on the right edge: one tick per page section, the
 * current one filling as you read. Hovering (or focusing) the rail widens it
 * and reveals the section names; ticks jump to their section. Desktop only.
 */
export default function SectionRail() {
  const { sections, active, within } = useSectionProgress();
  if (sections.length < 3) return null;

  return (
    <nav
      aria-label="Page sections"
      className="group/rail fixed right-3 top-1/2 z-40 hidden -translate-y-1/2 lg:block"
    >
      <ol className="flex flex-col items-end gap-1.5 rounded-full py-2 pl-3 pr-1 transition-[background-color] duration-500 group-hover/rail:bg-bg/70 group-focus-within/rail:bg-bg/70 group-hover/rail:backdrop-blur">
        {sections.map((s, i) => {
          const on = i === active;
          const done = i < active;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => scrollToTarget(s.el, -64)}
                aria-current={on ? "true" : undefined}
                aria-label={`${pad(i + 1)} ${s.label}`}
                className="flex items-center justify-end gap-3 py-1 outline-offset-2"
              >
                <span
                  className={cn(
                    "pointer-events-none max-w-0 overflow-hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-widest opacity-0 transition-[max-width,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/rail:max-w-56 group-hover/rail:opacity-100 group-focus-within/rail:max-w-56 group-focus-within/rail:opacity-100",
                    on ? "text-accent" : "text-muted",
                  )}
                >
                  <span className="mr-2 text-fg/40">{pad(i + 1)}</span>
                  {s.label}
                </span>
                {/* The tick: a 2px track that fills through the current section. */}
                <span
                  aria-hidden
                  className={cn(
                    "relative block w-0.5 overflow-hidden rounded-full bg-fg/15 transition-[height,background-color] duration-500",
                    on ? "h-10" : "h-4 group-hover/rail:h-5",
                  )}
                >
                  <span
                    className="absolute inset-x-0 top-0 bg-accent transition-[height] duration-200"
                    style={{ height: `${(done ? 1 : on ? within : 0) * 100}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
