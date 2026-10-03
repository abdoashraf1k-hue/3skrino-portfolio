import Link from "next/link";
import type { Category } from "@/data/categories";
import { cn, pad } from "@/lib/utils";

const GRADIENTS = [
  "linear-gradient(160deg, #262626, #0e0e0e 40%, #1c1c1c 70%, #0a0a0a)",
  "linear-gradient(200deg, #0e0e0e, #242424 45%, #0b0b0b 75%, #1a1a1a)",
  "linear-gradient(140deg, #1e1e1e, #0b0b0b 35%, #262626 65%, #0e0e0e)",
];

// Hover-only "[ ● … ]" markers: zero-width at rest so the count stays flush left.
const marker =
  "inline-block max-w-0 overflow-hidden whitespace-pre opacity-0 transition-[max-width,opacity] duration-[400ms] group-hover:max-w-6 group-hover:opacity-100 group-focus-visible:max-w-6 group-focus-visible:opacity-100";

export default function CategoryCard({ category, index }: { category: Category; index: number }) {
  return (
    <Link
      href={`/work/${category.id}`}
      data-cat={category.id}
      data-hover
      className="group relative flex aspect-[3/4] flex-col border border-line p-6 transition-[background-color,border-color,transform] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-cat hover:bg-cat/[0.03] focus-visible:border-cat active:scale-[0.98] active:duration-150 md:p-8"
    >
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
        <span className="rounded-[3px] border border-fg/20 px-1.5 py-0.5 tabular-nums text-muted transition-colors duration-[400ms] group-hover:border-cat group-hover:text-cat">
          {pad(index + 1)}
        </span>
        <span className="flex items-center gap-1.5 text-cat opacity-0 transition-opacity duration-[400ms] group-hover:opacity-100 group-focus-visible:opacity-100">
          REC <span className="size-1.5 rounded-full bg-accent-2" />
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
              <span className="flex size-10 items-center justify-center rounded-full border border-fg/30 text-[9px] transition-colors duration-300 group-hover:border-cat group-hover:text-cat">
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
        <h3 className="type-display text-[clamp(2.25rem,3.4vw,3rem)] leading-none transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1">
          {category.name}
        </h3>
        <span className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
          <span className="flex items-center">
            <span aria-hidden className={marker}>
              {"[ "}
            </span>
            <span aria-hidden className={cn(marker, "text-cat")}>
              {"● "}
            </span>
            {category.count} {category.count === 1 ? "Project" : "Projects"}
            <span aria-hidden className={marker}>
              {" ]"}
            </span>
          </span>
          <span
            className="text-sm transition-[transform,color] duration-[400ms] group-hover:translate-x-1 group-hover:text-cat"
          >
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
