"use client";

import type { ReactNode } from "react";
import Reveal from "@/components/ui/Reveal";
import { useSectionInfo } from "@/components/ui/SectionContext";
import { parseHeadline, useText } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** `italic` sets the line in the editorial accent: italic + accent colour. */
export type HeadlineLine = string | { text: string; className?: string; italic?: boolean };

type SectionHeaderProps = {
  /** Fallback number; on the home page the layout's running number wins. */
  index?: string;
  /**
   * admin → Text keys: `${textKey}.label` and `${textKey}.headline` replace
   * `label` / `lines` (which then needn't be passed).
   */
  textKey?: string;
  label?: string;
  lines?: HeadlineLine[];
  aside?: ReactNode;
  className?: string;
};

/**
 * "(01) // LABEL ——— ✦" bar that sticks under the nav while its section
 * scrolls, a huge ghost number in the corner, and the two-line display
 * headline that rises in as one block.
 *
 * Render it as a direct child of the section's full-height container — the
 * sticky bar is bounded by its parent, so that's what keeps it pinned for
 * the whole section.
 */
export default function SectionHeader({ index: indexProp = "", textKey, label: labelProp = "", lines: linesProp = [], aside, className }: SectionHeaderProps) {
  const index = useSectionInfo()?.index ?? indexProp;
  const t = useText();
  const label = textKey ? t(`${textKey}.label`) : labelProp;
  const lines: HeadlineLine[] = textKey ? parseHeadline(t(`${textKey}.headline`)) : linesProp;

  return (
    <>
      {/* Takes its section's background (soft sections set --section-bg), so it never shows as a band. */}
      <div
        className="sticky top-16 z-20 -mx-6 mb-6 px-6 py-3 backdrop-blur-md md:-mx-12 md:px-12 lg:-mx-20 lg:px-20"
        style={{ background: "color-mix(in srgb, var(--section-bg, var(--bg)) 80%, transparent)" }}
      >
        <Reveal y={20} duration={0.6}>
          <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest text-muted">
            <p className="shrink-0">
              {index && <>({index}) </>}
              <span className="text-accent">{"//"}</span> {label}
            </p>
            <span aria-hidden className="h-px flex-1 bg-line" />
            <span aria-hidden className="text-[12px] leading-none text-accent/40">
              ✦
            </span>
          </div>
        </Reveal>
      </div>

      <div className={cn("relative mb-8 grid grid-cols-12 items-end gap-6", className)}>
        {/* Ghost number: 5% of the foreground, bleeding off the top-right. */}
        {index && (
          <span
            aria-hidden
            className="type-display pointer-events-none absolute -top-[0.32em] right-0 z-0 select-none text-[clamp(9rem,24vw,24rem)] leading-none text-fg/[0.05]"
          >
            {index}
          </span>
        )}
        <Reveal y={60} duration={0.7} className="relative col-span-12 lg:col-span-8">
          <h2 className="type-display text-[clamp(3.25rem,9vw,9rem)] leading-[0.88]">
            {lines.map((line, i) => {
              const { text, className: lineClass, italic } =
                typeof line === "string" ? { text: line, className: undefined, italic: false } : line;
              return (
                <span key={i} className={cn("block", italic && "pr-[0.06em] italic text-accent", lineClass)}>
                  {text}
                </span>
              );
            })}
          </h2>
        </Reveal>
        {aside && (
          <Reveal y={60} duration={0.7} delay={0.15} className="relative col-span-12 lg:col-span-4 lg:justify-self-end">
            {aside}
          </Reveal>
        )}
      </div>
    </>
  );
}
