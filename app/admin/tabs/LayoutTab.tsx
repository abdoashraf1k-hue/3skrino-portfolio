"use client";

import ReorderList from "@/components/admin/ReorderList";
import { btn, card, micro, Section, TabHeader } from "@/components/admin/ui";
import { SECTION_LABELS, siteConfig as committed, type BentoPattern, type HomeSection, type SectionId } from "@/data/site-config";
import { useConfigStore } from "../store";

/** Sections whose content is a bento grid (the preset applies to them). */
const BENTO: ReadonlySet<SectionId> = new Set<SectionId>(["vertical", "horizontal", "ai"]);

/** Tiny schematic per preset: [col, row, w, h] cells on a 4×3 grid. */
const SCHEMES: Record<BentoPattern, { label: string; hint: string; cells: [number, number, number, number][] }> = {
  mosaic: {
    label: "Mosaic",
    hint: "varied 2×2 · tall · wide rhythm",
    cells: [
      [0, 0, 2, 2],
      [2, 0, 1, 1],
      [3, 0, 1, 1],
      [2, 1, 2, 1],
      [0, 2, 1, 1],
      [1, 2, 1, 1],
      [2, 2, 2, 1],
    ],
  },
  editorial: {
    label: "Editorial",
    hint: "fewer, bigger tiles",
    cells: [
      [0, 0, 2, 2],
      [2, 0, 1, 2],
      [3, 0, 1, 2],
      [0, 2, 2, 1],
      [2, 2, 2, 1],
    ],
  },
  uniform: {
    label: "Uniform",
    hint: "an even poster grid",
    cells: Array.from({ length: 8 }, (_, i) => [i % 4, Math.floor(i / 4) * 1.5, 1, 1.5] as [number, number, number, number]),
  },
};

function Scheme({ pattern }: { pattern: BentoPattern }) {
  return (
    <svg viewBox="0 0 40 30" className="h-9 w-12" aria-hidden>
      {SCHEMES[pattern].cells.map(([x, y, w, h], i) => (
        <rect key={i} x={x * 10 + 0.8} y={y * 10 + 0.8} width={w * 10 - 1.6} height={h * 10 - 1.6} rx="1" fill="currentColor" opacity={i === 0 ? 0.9 : 0.45} />
      ))}
    </svg>
  );
}

export default function LayoutTab() {
  const { site, setSite } = useConfigStore();
  if (!site) return null;

  const sections = site.layout.sections;
  const setSections = (next: HomeSection[]) => setSite((c) => ({ ...c, layout: { sections: next } }));
  const patch = (id: SectionId, p: Partial<HomeSection>) => setSections(sections.map((s) => (s.id === id ? { ...s, ...p } : s)));
  // The running number each visible chapter will show on the site.
  const numbers = new Map<SectionId, string>();
  for (const s of sections.filter((x) => x.visible && x.id !== "marquee")) numbers.set(s.id, String(numbers.size + 1).padStart(2, "0"));

  return (
    <div>
      <TabHeader
        title="Layout"
        hint="the home page after the hero — order, visibility and bento preset · section numbers follow the order · preview in the dock"
        actions={
          <button type="button" className={btn} onClick={() => setSections(committed.layout.sections)}>
            Reset to the committed order
          </button>
        }
      />

      <Section title="Home sections" hint="drag the ⋮⋮ handle (or Alt ↑/↓) to reorder">
        <ReorderList
          label="Home sections"
          handle
          items={sections}
          getId={(s) => s.id}
          onChange={setSections}
          className="flex flex-col gap-2"
          render={(s, i, move) => {
            const number = numbers.get(s.id) ?? "—";
            return (
              <div className={`${card} flex flex-wrap items-center gap-4 p-3 ${s.visible ? "" : "opacity-45"}`}>
                <span data-drag-handle className="cursor-grab select-none px-1 text-white/30 active:cursor-grabbing" aria-hidden>
                  ⋮⋮
                </span>
                <span className="w-7 font-mono text-[11px] tabular-nums text-[#e7fe55]">{number}</span>
                <span className="min-w-36 flex-1">
                  <span className="block text-sm font-bold uppercase tracking-wide">{SECTION_LABELS[s.id]}</span>
                  <span className={`${micro} text-[9px] text-white/35`}>{s.id === "marquee" ? "strip — not numbered" : `#${s.id}`}</span>
                </span>

                {BENTO.has(s.id) && (
                  <div role="radiogroup" aria-label={`${SECTION_LABELS[s.id]} bento preset`} className="flex gap-1">
                    {(Object.keys(SCHEMES) as BentoPattern[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={s.pattern === p}
                        title={`${SCHEMES[p].label} — ${SCHEMES[p].hint}`}
                        onClick={() => patch(s.id, { pattern: p })}
                        className={`flex flex-col items-center gap-1 border px-2 py-1.5 transition-colors ${
                          s.pattern === p ? "border-[#e7fe55] text-[#e7fe55]" : "border-white/10 text-white/40 hover:text-white"
                        }`}
                      >
                        <Scheme pattern={p} />
                        <span className="font-mono text-[8px] uppercase tracking-widest">{SCHEMES[p].label}</span>
                      </button>
                    ))}
                  </div>
                )}

                <span className="flex gap-1">
                  <button type="button" className={btn} aria-pressed={s.visible} onClick={() => patch(s.id, { visible: !s.visible })}>
                    {s.visible ? "Shown" : "Hidden"}
                  </button>
                  <button type="button" className={btn} aria-label="Move up" disabled={i === 0} onClick={() => move(-1)}>
                    ↑
                  </button>
                  <button type="button" className={btn} aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(1)}>
                    ↓
                  </button>
                </span>
              </div>
            );
          }}
        />
      </Section>
    </div>
  );
}
