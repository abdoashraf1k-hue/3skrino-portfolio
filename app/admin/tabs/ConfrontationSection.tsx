"use client";

import { useMemo, useState } from "react";
import { PoseSelect } from "@/components/admin/fields";
import { btn, card, micro, Section, Slider, Toggle } from "@/components/admin/ui";
import ConfrontationStage, { type StageState } from "@/components/heroes/ConfrontationStage";
import { poseMap } from "@/components/heroes/shared";
import type { ConfrontationConfig, ConfrontState } from "@/data/hero-config";
import { DEFAULT_CONFRONTATION } from "@/data/hero-defaults";
import { useConfigStore } from "../store";

const BEHAVIORS: { key: keyof ConfrontationConfig["behaviors"]; label: string; hint: string }[] = [
  { key: "tracking", label: "Tracking", hint: "head follows the pointer across the ladder" },
  { key: "eyeContact", label: "Eye contact", hint: "hover him: he looks at you, slight zoom" },
  { key: "smile", label: "Smile", hint: "stay still on him → smile + warm light" },
  { key: "surprise", label: "Surprise", hint: "click him" },
  { key: "turnAway", label: "Turn away", hint: "pointer idle / gone → he turns to the edge" },
  { key: "scoff", label: "Scoff", hint: "scroll him out of view → side-eye" },
  { key: "breathing", label: "Breathing", hint: "slow rise of the shoulders" },
  { key: "eyeGlint", label: "Lens glint", hint: "WebGL highlight that follows the cursor" },
  { key: "overlays", label: "Overlays", hint: "✦ on smile, ! on surprise, hm. on scoff" },
  { key: "gaspSound", label: "Gasp sound", hint: "on surprise — only for visitors with sound on" },
];

const STATES: { key: ConfrontState | "static"; label: string }[] = [
  { key: "idle", label: "Idle" },
  { key: "eyeContact", label: "Eye contact" },
  { key: "smile", label: "Smile" },
  { key: "surprise", label: "Surprise" },
  { key: "turnAway", label: "Turn away" },
  { key: "scoff", label: "Scoff" },
  { key: "static", label: "Static (phones / reduced motion)" },
];

const FORCE: (StageState | null)[] = [null, "idle", "tracking", "eyeContact", "smile", "surprise", "turnAway", "scoff"];

/** Poses → Confrontation: behaviours, pose per state, sensitivity, lenses, and a live test stage. */
export default function ConfrontationSection() {
  const { hero, setHero } = useConfigStore();
  const [force, setForce] = useState<StageState | null>(null);
  const [now, setNow] = useState<{ state: StageState; pose: string }>({ state: "idle", pose: "center" });
  const [showLenses, setShowLenses] = useState(false);
  const poses = useMemo(() => (hero ? [...poseMap(hero).values()] : []), [hero]);
  if (!hero) return null;

  const c = hero.confrontation;
  const set = (patch: Partial<ConfrontationConfig>) => setHero((h) => ({ ...h, confrontation: { ...h.confrontation, ...patch } }));
  const sens = <K extends keyof ConfrontationConfig["sensitivity"]>(k: K, v: number) => set({ sensitivity: { ...c.sensitivity, [k]: v } });
  const lens = (side: "left" | "right", axis: 0 | 1, v: number) => {
    const next: [number, number] = [...c.lenses[side]];
    next[axis] = v;
    set({ lenses: { ...c.lenses, [side]: next } });
  };

  return (
    <Section title="Confrontation" hint="Hero A — pick it in Heroes · the test stage on the right plays the draft" onReset={() => set(DEFAULT_CONFRONTATION)}>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="min-w-0">
          <p className={`${micro} mb-2 text-white/50`}>Behaviours</p>
          <div className="grid gap-2 md:grid-cols-2">
            {BEHAVIORS.map((b) => (
              <Toggle key={b.key} label={b.label} hint={b.hint} checked={c.behaviors[b.key]} onChange={(v) => set({ behaviors: { ...c.behaviors, [b.key]: v } })} />
            ))}
          </div>

          <p className={`${micro} mb-2 mt-6 text-white/50`}>Pose per state</p>
          <div className="grid gap-2 md:grid-cols-2">
            {STATES.map((s) => (
              <PoseSelect key={s.key} label={s.label} value={c.poses[s.key]} poses={poses} onChange={(id) => set({ poses: { ...c.poses, [s.key]: id } })} />
            ))}
          </div>

          <p className={`${micro} mb-2 mt-6 text-white/50`}>Sensitivity</p>
          <div className="grid gap-2 md:grid-cols-2">
            <Slider label="Tracking" hint="how far the head swings for the same pointer move" min={0} max={1} step={0.01} value={c.sensitivity.tracking} onChange={(v) => sens("tracking", v)} />
            <Slider label="Smile after" min={0.5} max={20} step={0.5} format={(v) => `${v.toFixed(1)}s`} value={c.sensitivity.smileAfter} onChange={(v) => sens("smileAfter", v)} />
            <Slider label="Surprise hold" hint="after the crossfade lands" min={100} max={4000} step={50} format={(v) => `${Math.round(v)}ms`} value={c.sensitivity.surpriseHold} onChange={(v) => sens("surpriseHold", v)} />
            <Slider label="Turn away after" min={2} max={60} step={0.5} format={(v) => `${v.toFixed(1)}s`} value={c.sensitivity.turnAwayAfter} onChange={(v) => sens("turnAwayAfter", v)} />
            <Slider label="Eye-contact zoom" min={1} max={1.2} step={0.005} format={(v) => `${v.toFixed(3)}×`} value={c.sensitivity.eyeContactZoom} onChange={(v) => sens("eyeContactZoom", v)} />
            <Slider label="Glint" min={0} max={1} step={0.01} value={c.sensitivity.glint} onChange={(v) => sens("glint", v)} />
            <Slider label="Breathing" min={0} max={1} step={0.01} value={c.sensitivity.breathing} onChange={(v) => sens("breathing", v)} />
          </div>

          <p className={`${micro} mb-2 mt-6 text-white/50`}>Lenses (glint placement, fractions of the image)</p>
          <div className="grid gap-2 md:grid-cols-2">
            <Slider label="Left lens x" min={0} max={1} step={0.001} format={(v) => v.toFixed(3)} value={c.lenses.left[0]} onChange={(v) => lens("left", 0, v)} />
            <Slider label="Left lens y" min={0} max={1} step={0.001} format={(v) => v.toFixed(3)} value={c.lenses.left[1]} onChange={(v) => lens("left", 1, v)} />
            <Slider label="Right lens x" min={0} max={1} step={0.001} format={(v) => v.toFixed(3)} value={c.lenses.right[0]} onChange={(v) => lens("right", 0, v)} />
            <Slider label="Right lens y" min={0} max={1} step={0.001} format={(v) => v.toFixed(3)} value={c.lenses.right[1]} onChange={(v) => lens("right", 1, v)} />
            <Slider label="Lens radius" min={0.02} max={0.2} step={0.001} format={(v) => v.toFixed(3)} value={c.lenses.radius} onChange={(v) => set({ lenses: { ...c.lenses, radius: v } })} />
            <Toggle label="Show lens guides" hint="in the test stage" checked={showLenses} onChange={setShowLenses} />
          </div>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <p className={`${micro} mb-2 text-white/50`}>Test stage — move, hover, hold still, click</p>
          <div className="relative overflow-hidden border border-white/10 bg-[#0a0a0a]">
            <ConfrontationStage hero={hero} config={c} live forceState={force} onStateChange={(state, pose) => setNow({ state, pose })} />
            {showLenses &&
              (["left", "right"] as const).map((side) => (
                <span
                  key={side}
                  aria-hidden
                  className="pointer-events-none absolute rounded-[50%] border border-dashed border-[#e7fe55]"
                  style={{
                    left: `${(c.lenses[side][0] - c.lenses.radius * 1.25) * 100}%`,
                    top: `${(c.lenses[side][1] - c.lenses.radius * 0.82) * 100}%`,
                    width: `${c.lenses.radius * 2.5 * 100}%`,
                    height: `${c.lenses.radius * 1.64 * 100}%`,
                  }}
                />
              ))}
          </div>
          <p className={`${card} ${micro} mt-2 px-3 py-2 text-white/60`}>
            state <span className="text-[#e7fe55]">{now.state}</span> · pose <span className="text-[#e7fe55]">{now.pose}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Force a state">
            {FORCE.map((s) => (
              <button key={s ?? "live"} type="button" className={`${btn} ${force === s ? "border-[#e7fe55] text-[#e7fe55]" : ""}`} onClick={() => setForce(s)}>
                {s ?? "Live"}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </Section>
  );
}
