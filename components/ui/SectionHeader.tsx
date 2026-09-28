import type { ReactNode } from "react";
import Reveal from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

export type HeadlineLine = string | { text: string; className?: string };

type SectionHeaderProps = {
  index: string;
  label: string;
  lines: HeadlineLine[];
  aside?: ReactNode;
  className?: string;
};

/** "(01) LABEL" + two-line display headline whose words rise in one by one. */
export default function SectionHeader({ index, label, lines, aside, className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-16 grid grid-cols-12 items-end gap-6 md:mb-24", className)}>
      <Reveal y={60} duration={1} className="col-span-12">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
          ({index}) {label}
        </p>
      </Reveal>
      <Reveal words y={60} duration={1} className="col-span-12 lg:col-span-8">
        <h2 className="text-[clamp(3rem,8vw,8rem)] font-black uppercase leading-[0.9] tracking-tight">
          {lines.map((line, i) => {
            const { text, className: lineClass } = typeof line === "string" ? { text: line, className: undefined } : line;
            return (
              <span key={i} className={cn("block", lineClass)}>
                {text.split(" ").map((word, w) => (
                  <span key={w} data-reveal-word className="mr-[0.22em] inline-block last:mr-0">
                    {word}
                  </span>
                ))}
              </span>
            );
          })}
        </h2>
      </Reveal>
      {aside && (
        <Reveal y={60} duration={1} delay={0.15} className="col-span-12 lg:col-span-4 lg:justify-self-end">
          {aside}
        </Reveal>
      )}
    </div>
  );
}
