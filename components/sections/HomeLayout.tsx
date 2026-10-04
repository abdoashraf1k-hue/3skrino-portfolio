"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import DiagonalDivider, { type Tone } from "@/components/ui/DiagonalDivider";
import { SectionContext } from "@/components/ui/SectionContext";
import type { SectionId } from "@/data/site-config";
import { useCinematic } from "@/lib/cinematic";
import { useSiteConfig } from "@/lib/live-config";
import { pad } from "@/lib/utils";

/** Background tone per section, so the diagonal seams blend the right colours. */
const TONE: Record<SectionId, Tone> = {
  marquee: "base",
  vertical: "base",
  horizontal: "soft",
  fields: "base",
  ai: "base",
  about: "base",
  contact: "base",
};

/** The marquee is a strip, not a chapter — it isn't numbered and needs no seams. */
const UNNUMBERED = new Set<SectionId>(["marquee"]);

/**
 * Orders, hides and numbers the home sections from the site config
 * (admin → Layout) — live in the admin preview. The sections themselves are
 * rendered on the server and passed in as nodes.
 */
export default function HomeLayout({ sections }: { sections: Partial<Record<SectionId, ReactNode>> }) {
  const { layout } = useSiteConfig();
  const fx = useCinematic().sections;
  const visible = layout.sections.filter((s) => s.visible && sections[s.id]);
  // Running chapter numbers (the marquee strip isn't one).
  const numbered = visible.filter((s) => !UNNUMBERED.has(s.id)).map((s) => s.id);

  return (
    <>
      {visible.map((s, i) => {
        const at = numbered.indexOf(s.id);
        const index = at >= 0 ? pad(at + 1) : "";
        const from = i > 0 ? visible[i - 1].id : null;
        const seam = from !== null && !UNNUMBERED.has(from) && at >= 0;
        return (
          <Fragment key={s.id}>
            {seam && from && <DiagonalDivider from={TONE[from]} to={TONE[s.id]} flip={i % 2 === 0} />}
            {/* data-fx-section: the cinematic layer's per-section overrides (admin → Sections) hook in here. */}
            <div
              data-fx-section={s.id}
              data-fx-crt={fx[s.id]?.crt ? "" : undefined}
              data-fx-ca={fx[s.id]?.chromatic ? "" : undefined}
              style={fx[s.id]?.chromatic ? ({ "--fx-ca-local": `${(fx[s.id]?.chromatic ?? 0) * 4}px` } as CSSProperties) : undefined}
            >
              <SectionContext.Provider value={{ index, pattern: s.pattern, id: s.id }}>{sections[s.id]}</SectionContext.Provider>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
