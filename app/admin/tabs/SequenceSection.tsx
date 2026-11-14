"use client";

import { useState } from "react";
import AngleEnginePanel from "@/components/admin/AngleEnginePanel";
import MiniPreview from "@/components/admin/MiniPreview";
import { btn, micro, Section, Toggle } from "@/components/admin/ui";
import type { SequenceFrame } from "@/data/hero-config";
import type { HeroVariant } from "@/data/site-config";
import { useConfigStore } from "../store";

/** Heroes that turn the 360° sequence, and their admin names. */
const TURNING: Partial<Record<HeroVariant, string>> = { genesis: "Genesis", model3d: "3D model" };

/**
 * Sprint 15.6 — Poses → 360° sequence · AI Reality Engine, on its own and
 * hero-agnostic: the frames live in hero-config → model3d.sequenceImages and
 * every hero that turns (Genesis, 3D model) reads them, so the engine works
 * on whichever of those is live. The preview shows the live hero — or
 * Genesis when the live hero doesn't turn.
 */
export default function SequenceSection({ adminKey, onError }: { adminKey: string; onError: (m: string) => void }) {
  const { hero, setHero, site, setSite } = useConfigStore();
  const [live, setLive] = useState(true);
  if (!hero || !site) return null;

  const active = site.heroVariant;
  const turns = active in TURNING;
  const previewVariant: HeroVariant = turns ? active : "genesis";
  const setFrames = (fn: (l: SequenceFrame[]) => SequenceFrame[]) =>
    setHero((c) => ({ ...c, model3d: { ...c.model3d, sequenceImages: fn(c.model3d.sequenceImages) } }));

  return (
    <Section
      title="360° sequence · AI Reality Engine"
      hint="the turning head of every 360° hero · AI fills missing angles · frames arrive matted and land in the media bucket · save to publish"
      aside={<Toggle label="Live preview" checked={live} onChange={setLive} />}
    >
      <p className={`${micro} mb-4 flex flex-wrap items-center gap-3 ${turns ? "text-white/45" : "border border-[#ffb54d]/40 bg-[#ffb54d]/10 p-3 text-[#ffcf8a]"}`}>
        {turns ? (
          <>
            Live hero: <span className="text-[#e7fe55]">{TURNING[active]}</span> — it turns these frames now. {Object.values(TURNING).join(" and ")} share them.
          </>
        ) : (
          <>
            The live hero doesn’t turn a 360° sequence — these frames drive {Object.values(TURNING).join(" and ")}. The preview shows Genesis.
            <button type="button" className={btn} onClick={() => setSite((c) => ({ ...c, heroVariant: "genesis" }))}>
              Make Genesis the hero
            </button>
          </>
        )}
      </p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="min-w-0">
          <AngleEnginePanel frames={hero.model3d.sequenceImages} setFrames={setFrames} adminKey={adminKey} onError={onError} />
        </div>
        <div className="min-w-0">
          <MiniPreview path={`/?heroVariant=${previewVariant}`} hero={hero} site={site} enabled={live} title={`${TURNING[previewVariant]} preview`} />
          <p className={`${micro} mt-2 text-white/35`}>New angles appear here as they arrive — move the mouse over the preview to turn.</p>
        </div>
      </div>
    </Section>
  );
}
