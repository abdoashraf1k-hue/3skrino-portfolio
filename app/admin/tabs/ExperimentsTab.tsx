"use client";

import type { CSSProperties, ReactNode } from "react";
import { btn, card, micro, Section, Segmented, Slider, TabHeader, Toggle } from "@/components/admin/ui";
import { ASPECT_RATIOS, DEFAULT_CINEMATIC, DEFAULT_EFFECTS, EXPERIMENT_EFFECT } from "@/data/cinematic-defaults";
import type { CinematicConfig, CinematicEffects, EffectId } from "@/data/site-config";
import { EFFECT_META } from "../effects-meta";
import { useConfigStore } from "../store";
import { firePreviewTransition } from "./EffectsTab";

type Exp = keyof CinematicConfig["experiments"];
const pct = (v: number) => `${Math.round(v * 100)}%`;

const NOTES: Record<Exp, string> = {
  vhs: "Tape-era look: lines, a rolling band, smeared colour.",
  crt: "The whole site on a curved, glowing tube.",
  filmBurn: "The page burns through on every transition.",
  letterbox: "Matte the screen to a cinema ratio.",
  timeRemap: "Scroll speed ramps — fast flicks, slow arrivals.",
  shutterFlash: "A camera shutter fires between pages.",
  filmScratch: "Hairline scratches over the frame.",
};

/**
 * Experiment Lab: quick on-switches for the wilder effects, each with its
 * intensity right there. An experiment is on if its switch here OR its
 * effect in admin → Effects is on; the sliders are shared with Effects.
 */
export default function ExperimentsTab() {
  const { site, setSite } = useConfigStore();
  if (!site) return null;
  const c = site.cinematic;
  const e = c.effects;

  const setExp = (k: Exp, v: boolean) => setSite((s) => ({ ...s, cinematic: { ...s.cinematic, experiments: { ...s.cinematic.experiments, [k]: v } } }));
  const setFx = <K extends EffectId>(id: K, patch: Partial<CinematicEffects[K]>) =>
    setSite((s) => ({ ...s, cinematic: { ...s.cinematic, effects: { ...s.cinematic.effects, [id]: { ...s.cinematic.effects[id], ...patch } } } }));
  const resetAll = () =>
    setSite((s) => ({
      ...s,
      cinematic: {
        ...s.cinematic,
        experiments: DEFAULT_CINEMATIC.experiments,
        effects: {
          ...s.cinematic.effects,
          ...Object.fromEntries((Object.values(EXPERIMENT_EFFECT) as EffectId[]).map((id) => [id, { ...DEFAULT_EFFECTS[id], enabled: s.cinematic.effects[id].enabled }])),
        },
      },
    }));

  const sliders: Record<Exp, ReactNode> = {
    vhs: (
      <>
        <Slider label="Scanlines" value={e.vhs.scanlines} format={pct} onChange={(v) => setFx("vhs", { scanlines: v })} />
        <Slider label="Tracking" value={e.vhs.tracking} format={pct} onChange={(v) => setFx("vhs", { tracking: v })} />
        <Slider label="Bleeding" value={e.vhs.bleeding} format={pct} onChange={(v) => setFx("vhs", { bleeding: v })} />
      </>
    ),
    crt: (
      <>
        <Slider label="Curve" value={e.crt.curve} format={pct} onChange={(v) => setFx("crt", { curve: v })} />
        <Slider label="Glow" value={e.crt.glow} format={pct} onChange={(v) => setFx("crt", { glow: v })} />
        <Slider label="Trails" value={e.crt.trails} format={pct} onChange={(v) => setFx("crt", { trails: v })} />
      </>
    ),
    filmBurn: (
      <>
        <Slider label="Intensity" value={e.filmBurn.intensity} format={pct} onChange={(v) => setFx("filmBurn", { intensity: v })} />
        <Slider label="Duration" value={e.filmBurn.duration} min={0.3} max={2} step={0.05} format={(v) => `${v.toFixed(2)}s`} onChange={(v) => setFx("filmBurn", { duration: v })} />
      </>
    ),
    letterbox: (
      <div className={`${card} px-3 py-2.5`}>
        <p className="mb-2 text-sm">Ratio</p>
        <Segmented label="Ratio" value={e.letterbox.ratio} onChange={(v) => setFx("letterbox", { ratio: v })} options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))} />
      </div>
    ),
    timeRemap: <Slider label="Strength" value={e.timeRemap.strength} format={pct} onChange={(v) => setFx("timeRemap", { strength: v })} />,
    shutterFlash: <p className="text-xs text-white/45">No intensity — it&apos;s a flash.</p>,
    filmScratch: <Slider label="Density" value={e.filmScratch.density} format={pct} onChange={(v) => setFx("filmScratch", { density: v })} />,
  };

  const exps = Object.keys(EXPERIMENT_EFFECT) as Exp[];
  const live = exps.filter((k) => c.experiments[k]).length;

  return (
    <div>
      <TabHeader title="Experiment Lab" hint={`the video editor's playground · ${live} running · intensities are shared with admin → Effects`} />
      <Section title="Experiments" help="Each switch turns the effect on without touching its Effects switch — so you can try things here and keep a clean baseline in Effects." onReset={resetAll}>
        <div className="grid gap-3 lg:grid-cols-2">
          {exps.map((k, i) => {
            const id = EXPERIMENT_EFFECT[k];
            const on = c.experiments[k];
            const viaEffects = e[id].enabled;
            return (
              <div key={k} className={`admin-stagger ${card} flex flex-col gap-3 p-3 ${on ? "border-[#9b8cff]/50 bg-[#9b8cff]/[0.04]" : ""}`} style={{ "--i": i } as CSSProperties}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black uppercase tracking-tight">{EFFECT_META[id].name}</p>
                    <p className="text-xs text-white/50">{NOTES[k]}</p>
                    {viaEffects && <p className={`${micro} mt-1 text-[9px] text-[#e7fe55]/80`}>already on in Effects</p>}
                  </div>
                  <div className="w-40 shrink-0">
                    <Toggle label={on ? "Running" : "Off"} checked={on} onChange={(v) => setExp(k, v)} />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">{sliders[k]}</div>
                {(k === "filmBurn" || k === "shutterFlash") && (
                  <button type="button" className={`${btn} self-start`} onClick={firePreviewTransition}>
                    ▶ Fire a transition in the preview
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
