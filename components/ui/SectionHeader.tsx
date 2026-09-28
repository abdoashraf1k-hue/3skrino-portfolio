import type { ReactNode } from "react";
import Reveal from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

/** `italic` sets the line in the editorial accent: italic + accent colour. */
export type HeadlineLine = string | { text: string; className?: string; italic?: boolean };

type SectionHeaderProps = {
  index: string;
  label: string;
  lines: HeadlineLine[];
  aside?: ReactNode;
  className?: string;
};

/** "(01) // LABEL ——— ✦" + two-line display headline that rises in as one block. */
export default function SectionHeader({ index, label, lines, aside, className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-8 grid grid-cols-12 items-end gap-6", className)}>
      <Reveal y={60} duration={0.7} className="col-span-12">
        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest text-muted">
          <p className="shrink-0">
            ({index}) <span className="text-accent">{"//"}</span> {label}
          </p>
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span aria-hidden className="text-[12px] leading-none text-accent/40">
            ✦
          </span>
        </div>
      </Reveal>
      <Reveal y={60} duration={0.7} className="col-span-12 lg:col-span-8">
        <h2 className="text-[clamp(3rem,8vw,8rem)] font-black uppercase leading-[0.9] tracking-tight">
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
        <Reveal y={60} duration={0.7} delay={0.15} className="col-span-12 lg:col-span-4 lg:justify-self-end">
          {aside}
        </Reveal>
      )}
    </div>
  );
}
