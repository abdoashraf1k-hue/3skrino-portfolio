import type { ReactNode } from "react";
import Reveal from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  index: string;
  label: string;
  lines: ReactNode[];
  aside?: ReactNode;
  className?: string;
};

/** "(01) LABEL" + two-line display headline, with an optional right-hand slot. */
export default function SectionHeader({ index, label, lines, aside, className }: SectionHeaderProps) {
  return (
    <Reveal
      stagger
      className={cn("mb-16 grid grid-cols-12 items-end gap-6 md:mb-24", className)}
    >
      <p className="col-span-12 font-mono text-[11px] uppercase tracking-widest text-muted">
        ({index}) {label}
      </p>
      <h2 className="col-span-12 text-[clamp(3rem,8vw,8rem)] font-black uppercase leading-[0.9] tracking-tight lg:col-span-8">
        {lines.map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
      </h2>
      {aside && <div className="col-span-12 lg:col-span-4 lg:justify-self-end">{aside}</div>}
    </Reveal>
  );
}
