import type { CSSProperties, ReactNode } from "react";
import { cn, CONTAINER } from "@/lib/utils";

type PageHeaderProps = {
  label: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
};

/** Stagger: 0.2s, then 0.08s per item (same timing as the old framer-motion reveal). */
const at = (i: number) => ({ "--reveal-delay": `${0.2 + i * 0.08}s` }) as CSSProperties;

/**
 * Top-of-page header for inner routes — reveals on load.
 *
 * The reveal is CSS (globals.css → .reveal-up / .reveal-rise), so it starts with the first
 * paint instead of waiting for hydration: on a phone the title (usually the page's LCP
 * element) used to stay invisible for the whole hydration. The title only slides — it is
 * never transparent — so it counts as painted immediately.
 */
export default function PageHeader({ label, title, description, meta, children }: PageHeaderProps) {
  let i = 0;
  return (
    <header className={cn(CONTAINER, "pb-16 pt-40 md:pb-24 md:pt-48")}>
      <p className="reveal-up mb-6 font-mono text-[11px] uppercase tracking-widest text-muted" style={at(i++)}>
        {label}
      </p>
      <h1 className="reveal-rise type-display text-[clamp(4rem,14vw,14rem)] leading-[0.86]" style={at(i++)}>
        {title}
      </h1>
      {(description || meta) && (
        <div className="reveal-up mt-10 grid grid-cols-12 gap-6 border-t border-line pt-8" style={at(i++)}>
          {description && (
            <p className="col-span-12 max-w-2xl text-lg leading-relaxed text-muted md:col-span-8 md:text-xl">
              {description}
            </p>
          )}
          {meta && (
            <div className="col-span-12 font-mono text-[11px] uppercase tracking-widest text-muted md:col-span-4 md:text-right">
              {meta}
            </div>
          )}
        </div>
      )}
      {children && (
        <div className="reveal-up" style={at(i++)}>
          {children}
        </div>
      )}
    </header>
  );
}
