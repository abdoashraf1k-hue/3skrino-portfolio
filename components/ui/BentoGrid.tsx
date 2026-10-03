"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import Reveal from "@/components/ui/Reveal";
import { useSectionInfo } from "@/components/ui/SectionContext";
import type { BentoPattern } from "@/data/site-config";
import { cn, EASE_OUT } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
/** Tile shape hint: square = 2×2, wide = 2×1, tall = 1×2, small = 1×1. */
export type BentoAspect = "square" | "wide" | "tall" | "small";

export type BentoItem = {
  id: string;
  /** The tile's content — it should fill its box (size-full / h-full). */
  node: ReactNode;
  aspect?: BentoAspect;
  /** Any value > 0 makes this a 2×2 hero tile, whatever its aspect. */
  priority?: number;
};

type Props = {
  items: BentoItem[];
  /** Desktop (≥1024px) column count. Tablet is always 2, mobile 1. */
  columns?: 2 | 3 | 4 | 5 | 6;
  /** Tailwind spacing units (4 = 16px). */
  gap?: number;
  /** framer-motion layout + enter/exit, for grids whose items get filtered. */
  animateLayout?: boolean;
  /** Extra classes for each tile's tilt wrapper (e.g. its corner radius). */
  tileClassName?: string;
  /** Layout preset. Defaults to the enclosing home section's (admin → Layout), else mosaic. */
  pattern?: BentoPattern;
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Spans                                                               */
/* ------------------------------------------------------------------ */
type Span = "1x1" | "2x1" | "1x2" | "2x2";

/** Shape for items with no hint — the bento rhythm. */
const CYCLE: Span[] = ["2x2", "1x1", "1x1", "2x1", "1x2", "1x1", "2x1", "1x2"];
/** Editorial: fewer, bigger tiles — every other one is a 2×2 or a wide band. */
const EDITORIAL: Span[] = ["2x2", "1x2", "1x2", "2x1", "2x2", "2x1"];
const FROM_ASPECT: Record<BentoAspect, Span> = { square: "2x2", wide: "2x1", tall: "1x2", small: "1x1" };
/** Editorial upsizes the aspect hints by one step. */
const EDITORIAL_FROM_ASPECT: Record<BentoAspect, Span> = { square: "2x2", wide: "2x1", tall: "1x2", small: "1x2" };

const SPAN_SIZE: Record<Span, { w: number; h: number }> = {
  "1x1": { w: 1, h: 1 },
  "2x1": { w: 2, h: 1 },
  "1x2": { w: 1, h: 2 },
  "2x2": { w: 2, h: 2 },
};

// Static strings so Tailwind sees every class (tail-filling can grow a tile
// past the four base shapes).
const LG_COL_SPAN = ["", "lg:col-span-1", "lg:col-span-2", "lg:col-span-3", "lg:col-span-4", "lg:col-span-5", "lg:col-span-6"];
const LG_ROW_SPAN = ["", "lg:row-span-1", "lg:row-span-2", "lg:row-span-3", "lg:row-span-4"];
const MAX_ROWS = LG_ROW_SPAN.length - 1;
const DESKTOP_COLS: Record<NonNullable<Props["columns"]>, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/**
 * Desktop spans per pattern. mosaic: priority → 2×2, then the aspect hint,
 * else the next CYCLE step. editorial: same, upsized, every third tile a
 * 2×2. uniform: every tile 1×1, priority ignored.
 */
function resolveSpans(items: BentoItem[], pattern: BentoPattern): Span[] {
  let step = 0;
  if (pattern === "uniform") return items.map(() => "1x1");
  if (pattern === "editorial") {
    return items.map((item, i) => {
      if ((item.priority ?? 0) > 0 || i % 3 === 0) return "2x2";
      if (item.aspect) return EDITORIAL_FROM_ASPECT[item.aspect];
      return EDITORIAL[step++ % EDITORIAL.length];
    });
  }
  return items.map((item) => {
    if ((item.priority ?? 0) > 0) return "2x2";
    if (item.aspect) return FROM_ASPECT[item.aspect];
    return CYCLE[step++ % CYCLE.length];
  });
}

type Size = { w: number; h: number };

/**
 * Fixed spans leave holes that `dense` can't backfill (nothing comes after
 * the tail). Mirror the browser's dense auto-placement, then grow a
 * neighbour into each hole: widen the tile on its left, or deepen the tile
 * above. Holes stay empty in the final layout, so claiming them never moves
 * any other tile.
 */
function fillHoles(spans: Span[], columns: number): Size[] {
  const sizes = spans.map((s) => ({ w: Math.min(SPAN_SIZE[s].w, columns), h: SPAN_SIZE[s].h }));
  const grid: number[][] = []; // grid[row][col] = item index, -1 empty
  const cell = (r: number, c: number) => grid[r]?.[c] ?? -1;
  const claim = (i: number, r: number, c: number) => {
    while (grid.length <= r) grid.push(Array<number>(columns).fill(-1));
    grid[r][c] = i;
  };
  const at: { r: number; c: number }[] = [];

  // Dense placement: every item scans from the top-left for its first fit.
  sizes.forEach(({ w, h }, i) => {
    for (let r = 0; ; r++) {
      for (let c = 0; c + w <= columns; c++) {
        let fits = true;
        for (let dr = 0; dr < h && fits; dr++) for (let dc = 0; dc < w && fits; dc++) fits = cell(r + dr, c + dc) === -1;
        if (!fits) continue;
        for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) claim(i, r + dr, c + dc);
        at[i] = { r, c };
        return;
      }
    }
  });

  const rows = grid.length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (cell(r, c) !== -1) continue;
      // Widen the tile ending just left of the hole, if its whole right edge is free.
      const left = cell(r, c - 1);
      if (left !== -1 && at[left].c + sizes[left].w === c) {
        const { r: lr } = at[left];
        let free = true;
        for (let dr = 0; dr < sizes[left].h && free; dr++) free = cell(lr + dr, c) === -1;
        if (free) {
          for (let dr = 0; dr < sizes[left].h; dr++) claim(left, lr + dr, c);
          sizes[left].w++;
          continue;
        }
      }
      // Otherwise deepen the tile ending just above it, if its whole bottom edge is free.
      const up = cell(r - 1, c);
      if (up !== -1 && at[up].r + sizes[up].h === r && sizes[up].h < MAX_ROWS) {
        const { c: uc } = at[up];
        let free = true;
        for (let dc = 0; dc < sizes[up].w && free; dc++) free = cell(r, uc + dc) === -1;
        if (free) {
          for (let dc = 0; dc < sizes[up].w; dc++) claim(up, r, uc + dc);
          sizes[up].h++;
        }
      }
    }
  }
  return sizes;
}

/**
 * Per-breakpoint classes for one tile:
 * - mobile: one column, no spans — the tile's own aspect sets its height
 * - tablet (md): two columns, priority tiles 2×2, everything else 1×1
 * - desktop (lg): `columns` columns with the resolved span
 */
function tileClass(item: BentoItem, size: Size, pattern: BentoPattern): string {
  const priority = pattern !== "uniform" && (item.priority ?? 0) > 0;
  return cn(
    item.aspect === "wide" ? "aspect-video" : "aspect-[4/5]",
    "md:aspect-auto",
    priority ? "md:col-span-2 md:row-span-2" : "md:col-span-1 md:row-span-1",
    LG_COL_SPAN[size.w],
    LG_ROW_SPAN[size.h],
  );
}

/* ------------------------------------------------------------------ */
/* Tilt                                                                */
/* ------------------------------------------------------------------ */
/** Max tilt in degrees at a tile's edge (big tiles get less). */
const TILT = 8;
/** Desktop-class pointer with motion allowed — gates the tilt (CSS mirrors this). */
const HOVER_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const canHover = () => typeof window !== "undefined" && window.matchMedia(HOVER_QUERY).matches;

function setTilt(el: HTMLElement, rx: number, ry: number, gx = 50, gy = 50) {
  el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
  el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
  el.style.setProperty("--gx", `${gx.toFixed(1)}%`);
  el.style.setProperty("--gy", `${gy.toFixed(1)}%`);
}

/** Pointer-tracked 3D tilt + glare around any tile content. */
function TiltTile({ big, className, children }: { big: boolean; className?: string; children: ReactNode }) {
  const onEnter = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !canHover()) return;
    e.currentTarget.dataset.tilting = "";
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !canHover()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height;
    // The same angle reads as much more on a large plane.
    const max = big ? TILT * 0.6 : TILT;
    setTilt(e.currentTarget, (0.5 - py) * 2 * max, (px - 0.5) * 2 * max, px * 100, py * 100);
  };
  const onLeave = (e: PointerEvent<HTMLDivElement>) => {
    delete e.currentTarget.dataset.tilting;
    setTilt(e.currentTarget, 0, 0);
  };

  return (
    <div
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn("bento-tilt group/tile relative size-full overflow-hidden", className)}
    >
      {children}
      {/* Light catch that follows the pointer */}
      <span
        aria-hidden
        className="bento-glare pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover/tile:opacity-100"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grid                                                                */
/* ------------------------------------------------------------------ */
/**
 * Asymmetric CSS-grid mosaic with `grid-auto-flow: dense`, shared by every
 * project/reel listing. Tiles tilt toward a fine pointer; touch devices and
 * reduced motion get flat tiles.
 */
export default function BentoGrid({
  items,
  columns = 4,
  gap = 4,
  animateLayout = false,
  tileClassName = "rounded-[var(--radius-card)]",
  pattern: patternProp,
  className,
}: Props) {
  const section = useSectionInfo();
  const pattern = patternProp ?? section?.pattern ?? "mosaic";
  const spans = resolveSpans(items, pattern);
  const sizes = fillHoles(spans, columns);
  const style: CSSProperties = { gap: `${gap * 4}px` };
  const gridClass = cn(
    "grid grid-cols-1 md:grid-flow-dense md:grid-cols-2",
    // Uniform tiles are all 1×1 — give them a taller, poster-like row.
    pattern === "uniform"
      ? "md:auto-rows-[340px] lg:auto-rows-[300px] xl:auto-rows-[360px]"
      : "md:auto-rows-[260px] lg:auto-rows-[220px] xl:auto-rows-[260px]",
    DESKTOP_COLS[columns],
    className,
  );

  const tile = (item: BentoItem, i: number) => (
    <TiltTile big={sizes[i].w * sizes[i].h >= 4} className={tileClassName}>
      {item.node}
    </TiltTile>
  );

  if (animateLayout) {
    return (
      <motion.div layout className={gridClass} style={style}>
        <AnimatePresence mode="popLayout">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              className={tileClass(item, sizes[i], pattern)}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
            >
              {tile(item, i)}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <div className={gridClass} style={style}>
      {items.map((item, i) => (
        <Reveal key={item.id} className={tileClass(item, sizes[i], pattern)}>
          {tile(item, i)}
        </Reveal>
      ))}
    </div>
  );
}
