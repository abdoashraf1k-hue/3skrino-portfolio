"use client";

import Link from "next/link";
import { useState } from "react";
import Timecode from "@/components/ui/Timecode";
import type { Category } from "@/data/categories";
import { play } from "@/lib/sound";
import { cn, pad } from "@/lib/utils";

const GRADIENTS = [
  "linear-gradient(160deg, #262626, #0e0e0e 40%, #1c1c1c 70%, #0a0a0a)",
  "linear-gradient(200deg, #0e0e0e, #242424 45%, #0b0b0b 75%, #1a1a1a)",
  "linear-gradient(140deg, #1e1e1e, #0b0b0b 35%, #262626 65%, #0e0e0e)",
];

export default function CategoryCard({ category, index }: { category: Category; index: number }) {
  const [recording, setRecording] = useState(false);

  return (
    <Link
      href={`/work/${category.id}`}
      data-hover
      onMouseEnter={() => {
        setRecording(true);
        play("rewind");
      }}
      onMouseLeave={() => setRecording(false)}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      className="group relative flex aspect-[3/4] flex-col border border-line p-6 transition-[background-color,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-accent/[0.03] active:scale-[0.98] active:duration-150 md:p-8"
    >
      {/* Accent stroke that traces the perimeter on hover */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          pathLength={1}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:[stroke-dashoffset:0] group-focus-visible:[stroke-dashoffset:0]"
        />
      </svg>

      {/* Index ↔ live timecode flip */}
      <div className="relative h-4 font-mono text-[10px] uppercase tracking-widest [perspective:400px]">
        <span className="absolute inset-0 origin-bottom text-muted transition-[transform,opacity] duration-500 group-hover:-translate-y-1 group-hover:[transform:rotateX(90deg)] group-hover:opacity-0">
          {pad(index + 1)}
        </span>
        <span className="absolute inset-0 flex origin-top items-center gap-1.5 text-accent opacity-0 transition-[transform,opacity] duration-500 [transform:rotateX(-90deg)] group-hover:opacity-100 group-hover:[transform:rotateX(0deg)]">
          <span className="size-1.5 animate-pulse rounded-full bg-accent-2" />
          REC <Timecode running={recording} fields={3} />
        </span>
      </div>

      {/* Vertical 9:16 stand-in */}
      <div className="flex min-h-0 flex-1 items-center justify-center py-6">
        <div
          data-thumb
          className="anim-gradient relative aspect-[9/16] h-full max-w-full overflow-hidden rounded-md border border-line"
          style={{ backgroundImage: GRADIENTS[index % GRADIENTS.length] }}
        >
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="relative flex size-10 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full border border-fg/20 [animation-duration:2.4s]" />
              <span className="flex size-10 items-center justify-center rounded-full border border-fg/30 text-[9px] transition-colors duration-300 group-hover:border-accent group-hover:text-accent">
                ▶
              </span>
            </span>
          </span>
          <span className="absolute bottom-2 left-0 right-0 text-center font-mono text-[8px] uppercase tracking-widest text-muted">
            9:16
          </span>
        </div>
      </div>

      <div>
        <h3 className="text-[clamp(1.75rem,2.6vw,2.25rem)] font-black uppercase leading-none tracking-tight">
          {category.name}
        </h3>
        <span className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
          {category.count} {category.count === 1 ? "Project" : "Projects"}
          <span
            className={cn("text-sm transition-[transform,color] duration-300 group-hover:translate-x-1 group-hover:text-accent")}
          >
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
