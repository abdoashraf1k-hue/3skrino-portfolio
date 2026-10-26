"use client";

import Image from "next/image";
import type { Brand } from "@/data/brands";
import { cn } from "@/lib/utils";

type Props = {
  brands: Brand[];
  activeId: string | null;
  pending: boolean;
  onSelect: (id: string) => void;
  onClear: () => void;
};

/** Brand chips (logo + name + count), the active filter and a Clear button. */
export default function BrandFilterBar({ brands, activeId, pending, onSelect, onClear }: Props) {
  const active = brands.find((b) => b.id === activeId);
  return (
    <div className="mb-10 flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted">
        <p aria-live="polite">
          {active ? (
            <>
              Filtered by <span className="text-accent">{active.name}</span>
            </>
          ) : (
            "All brands"
          )}
          {pending && <span className="ml-2 animate-pulse text-fg/60">· loading</span>}
        </p>
        {active && (
          <button
            type="button"
            onClick={onClear}
            className="border border-line px-3 py-1.5 transition-colors duration-300 hover:border-fg hover:text-fg"
          >
            ✕ Clear filter
          </button>
        )}
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="Filter by brand">
        {brands.map((b) => {
          const on = b.id === activeId;
          return (
            <li key={b.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => (on ? onClear() : onSelect(b.id))}
                className={cn(
                  "flex items-center gap-2.5 border px-3 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300",
                  on ? "border-accent bg-accent/10 text-fg" : "border-line text-muted hover:border-fg hover:text-fg",
                )}
              >
                <span className="relative size-6 shrink-0">
                  <Image src={b.logoUrl} alt="" fill sizes="24px" unoptimized className="object-contain" />
                </span>
                {b.name}
                <span className="tabular-nums text-fg/40">{b.projectIds.length}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
