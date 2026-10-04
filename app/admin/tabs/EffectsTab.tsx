"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { btn, btnDanger, card, Choice, Help, input, micro, Segmented, Slider, TabHeader, Toggle } from "@/components/admin/ui";
import { LUT_LABELS, LutDefs, lutFilter } from "@/components/fx/lut";
import { DEFAULT_EFFECTS, defaultScope, EFFECT_IDS, EXPERIMENT_EFFECT, LUT_PRESETS, UNSCOPED_EFFECTS, ASPECT_RATIOS } from "@/data/cinematic-defaults";
import type { Project } from "@/data/projects";
import { SECTION_LABELS, type CinematicConfig, type CinematicEffects, type EffectId, type LutPreset, type ScopeRule, type SectionId } from "@/data/site-config";
import { ADMIN_PREVIEW_FX_EVENT } from "@/lib/live-config";
import { EFFECT_GROUPS, EFFECT_META, type EffectGroup } from "../effects-meta";
import { useConfigStore } from "../store";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const SECTION_IDS = Object.keys(SECTION_LABELS) as SectionId[];
/** Ask the preview dock to play a page transition (film burn / shutter flash) in its frame. */
export function firePreviewTransition() {
  window.dispatchEvent(new Event(ADMIN_PREVIEW_FX_EVENT));
}

type Props = { projects: Project[] };
type Filter = "all" | "on" | EffectGroup;

export default function EffectsTab({ projects }: Props) {
  const { site, setSite } = useConfigStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<EffectId>>(() => new Set());
  if (!site) return null;
  const c = site.cinematic;

  const setCine = (fn: (c: CinematicConfig) => CinematicConfig) => setSite((s) => ({ ...s, cinematic: fn(s.cinematic) }));
  const setFx = <K extends EffectId>(id: K, patch: Partial<CinematicEffects[K]>) =>
    setCine((cc) => ({ ...cc, effects: { ...cc.effects, [id]: { ...cc.effects[id], ...patch } } }));
  const setScope = (id: EffectId, rule: ScopeRule) => setCine((cc) => ({ ...cc, scopes: { ...cc.scopes, [id]: rule } }));
  const reset = (id: EffectId) =>
    setCine((cc) => {
      const scopes = { ...cc.scopes };
      delete scopes[id];
      return { ...cc, effects: { ...cc.effects, [id]: DEFAULT_EFFECTS[id] }, scopes };
    });
  const experimentOn = (id: EffectId) =>
    (Object.keys(EXPERIMENT_EFFECT) as (keyof CinematicConfig["experiments"])[]).some((k) => EXPERIMENT_EFFECT[k] === id && c.experiments[k]);
  const onCount = EFFECT_IDS.filter((id) => c.effects[id].enabled || experimentOn(id)).length;

  const allOff = () =>
    setCine((cc) => ({
      ...cc,
      effects: Object.fromEntries(EFFECT_IDS.map((id) => [id, { ...cc.effects[id], enabled: false }])) as unknown as CinematicEffects,
      experiments: Object.fromEntries(Object.keys(cc.experiments).map((k) => [k, false])) as CinematicConfig["experiments"],
    }));

  const toggleOpen = (id: EffectId) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visible = EFFECT_IDS.filter((id) =>
    filter === "all" ? true : filter === "on" ? c.effects[id].enabled || experimentOn(id) : EFFECT_META[id].group === filter,
  );

  return (
    <div>
      <LutDefs />
      <TabHeader
        title="Effects"
        hint={`the cinematic toolbox · ${onCount} of ${EFFECT_IDS.length} on · every effect is off by default and falls back to a still frame for reduced motion`}
        actions={
          <>
            <button type="button" className={btn} onClick={() => setOpen(new Set(visible))}>
              Expand all
            </button>
            <button type="button" className={btn} onClick={() => setOpen(new Set())}>
              Collapse
            </button>
            <button type="button" className={btnDanger} disabled={!onCount} onClick={allOff} title="Switch every effect and experiment off (values are kept)">
              Kill switch — all off
            </button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All 18" },
            { value: "on", label: `On (${onCount})` },
            ...EFFECT_GROUPS.map((g) => ({ value: g, label: g })),
          ]}
        />
        <span className={`${micro} text-white/35`}>tip: the dock shows the home page — scroll it to see section-scoped effects</span>
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((id) => {
          const meta = EFFECT_META[id];
          const fx = c.effects[id];
          const exp = experimentOn(id);
          const expanded = open.has(id);
          return (
            <div key={id} className={`${card} ${fx.enabled || exp ? "border-[#e7fe55]/30" : ""}`}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <button type="button" onClick={() => toggleOpen(id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="w-6 shrink-0 font-mono text-[10px] text-white/35">{String(meta.n).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
                      {meta.name}
                      {exp && <span className="bg-[#9b8cff]/20 px-1.5 py-px font-mono text-[8px] tracking-widest text-[#c9bfff]">Experiment on</span>}
                    </span>
                    <span className="block truncate text-xs text-white/45">{meta.blurb}</span>
                  </span>
                  <span className={`${micro} ml-auto hidden text-white/30 sm:inline`}>{meta.group}</span>
                  <span aria-hidden className={`text-white/40 transition-transform ${expanded ? "rotate-90" : ""}`}>
                    ›
                  </span>
                </button>
                <label className="flex shrink-0 cursor-pointer items-center gap-2">
                  <span className="sr-only">{meta.name} on</span>
                  <input type="checkbox" checked={fx.enabled} onChange={(e) => setFx(id, { enabled: e.target.checked } as Partial<CinematicEffects[typeof id]>)} className="peer sr-only" />
                  <span
                    aria-hidden
                    className="relative h-5 w-9 rounded-full bg-white/15 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[#e7fe55] peer-checked:after:translate-x-4 peer-checked:after:bg-[#0a0a0a] peer-focus-visible:ring-1 peer-focus-visible:ring-[#e7fe55]"
                  />
                </label>
              </div>

              {expanded && (
                <div className="admin-fade grid gap-4 border-t border-white/10 p-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="flex flex-col gap-3">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-white/55">
                      <Help>{meta.help}</Help>
                      {meta.help}
                    </p>
                    <Controls id={id} c={c} setFx={setFx} setCine={setCine} projects={projects} />
                    {!UNSCOPED_EFFECTS.has(id) && <ScopePicker rule={c.scopes[id] ?? defaultScope(id)} onChange={(r) => setScope(id, r)} />}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btn} onClick={() => reset(id)}>
                        ↺ Reset {meta.name}
                      </button>
                      {(id === "filmBurn" || id === "shutterFlash") && (
                        <button type="button" className={btn} onClick={firePreviewTransition} title="Plays a page transition in the preview dock">
                          ▶ Fire in preview
                        </button>
                      )}
                    </div>
                  </div>
                  <Demo id={id} c={c} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SetFx = <K extends EffectId>(id: K, patch: Partial<CinematicEffects[K]>) => void;

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Controls({
  id,
  c,
  setFx,
  setCine,
  projects,
}: {
  id: EffectId;
  c: CinematicConfig;
  setFx: SetFx;
  setCine: (fn: (c: CinematicConfig) => CinematicConfig) => void;
  projects: Project[];
}) {
  const e = c.effects;
  switch (id) {
    case "filmGrain":
      return (
        <Grid>
          <Slider label="Intensity" value={e.filmGrain.intensity} min={0} max={0.3} step={0.005} format={pct} onChange={(v) => setFx("filmGrain", { intensity: v })} />
          <Slider label="Flicker rate" value={e.filmGrain.flicker} min={1} max={24} step={1} format={(v) => `${v} fps`} onChange={(v) => setFx("filmGrain", { flicker: v })} />
          <Slider label="Dust" value={e.filmGrain.dust} format={pct} onChange={(v) => setFx("filmGrain", { dust: v })} />
        </Grid>
      );
    case "chromatic":
      return (
        <Grid>
          <Slider label="Strength" value={e.chromatic.strength} format={pct} onChange={(v) => setFx("chromatic", { strength: v })} />
          <Toggle label="Breathing" checked={e.chromatic.breathing} onChange={(v) => setFx("chromatic", { breathing: v })} hint="slow 4s pulse" />
        </Grid>
      );
    case "vhs":
      return (
        <Grid>
          <Slider label="Scanlines" value={e.vhs.scanlines} format={pct} onChange={(v) => setFx("vhs", { scanlines: v })} />
          <Slider label="Tracking" value={e.vhs.tracking} format={pct} onChange={(v) => setFx("vhs", { tracking: v })} help="The rolling band of noise. 0 hides it." />
          <Slider label="Colour bleeding" value={e.vhs.bleeding} format={pct} onChange={(v) => setFx("vhs", { bleeding: v })} />
        </Grid>
      );
    case "crt":
      return (
        <Grid>
          <Slider label="Screen curve" value={e.crt.curve} format={pct} onChange={(v) => setFx("crt", { curve: v })} />
          <Slider label="Edge glow" value={e.crt.glow} format={pct} onChange={(v) => setFx("crt", { glow: v })} />
          <Slider label="Phosphor trails" value={e.crt.trails} format={pct} onChange={(v) => setFx("crt", { trails: v })} />
        </Grid>
      );
    case "filmBurn":
      return (
        <Grid>
          <Slider label="Intensity" value={e.filmBurn.intensity} format={pct} onChange={(v) => setFx("filmBurn", { intensity: v })} />
          <Slider label="Duration" value={e.filmBurn.duration} min={0.3} max={2} step={0.05} format={(v) => `${v.toFixed(2)}s`} onChange={(v) => setFx("filmBurn", { duration: v })} />
        </Grid>
      );
    case "lightLeaks":
      return (
        <Grid>
          <Toggle label="Ambient leaks" checked={e.lightLeaks.ambient} onChange={(v) => setFx("lightLeaks", { ambient: v })} hint="drift + random flicker" />
          <Toggle label="Flare on hover" checked={e.lightLeaks.hover} onChange={(v) => setFx("lightLeaks", { hover: v })} hint="links & buttons" />
        </Grid>
      );
    case "glitch":
      return (
        <Grid>
          <Slider label="Strength" value={e.glitch.strength} format={pct} onChange={(v) => setFx("glitch", { strength: v })} />
          <Slider label="Frequency" value={e.glitch.frequency} format={(v) => `~${Math.round(14 - v * 12.6)}s apart`} onChange={(v) => setFx("glitch", { frequency: v })} />
          <Slider label="Block size" value={e.glitch.blockSize} min={4} max={80} step={1} format={(v) => `${v}px`} onChange={(v) => setFx("glitch", { blockSize: v })} />
        </Grid>
      );
    case "bars":
      return (
        <Grid>
          <Slider label="Height" value={e.bars.height} min={2} max={16} step={0.5} format={(v) => `${v}% of screen`} onChange={(v) => setFx("bars", { height: v })} />
          <Slider label="Opacity" value={e.bars.opacity} format={pct} onChange={(v) => setFx("bars", { opacity: v })} />
          <Toggle label="Hide on scroll" checked={e.bars.hideOnScroll} onChange={(v) => setFx("bars", { hideOnScroll: v })} hint="after 20% of a screen" />
        </Grid>
      );
    case "lut":
      return <LutControls c={c} setFx={setFx} setCine={setCine} projects={projects} />;
    case "cameraShake":
      return (
        <Grid>
          <Slider label="Intensity" value={e.cameraShake.intensity} format={pct} onChange={(v) => setFx("cameraShake", { intensity: v })} />
          <Slider
            label="Trigger threshold"
            value={e.cameraShake.threshold}
            min={10}
            max={120}
            step={1}
            format={(v) => `${v}px/frame`}
            onChange={(v) => setFx("cameraShake", { threshold: v })}
            help="Scroll speed needed to trigger a shake. A normal flick is 30–60; a hard fling 80+."
          />
        </Grid>
      );
    case "depthOfField":
      return (
        <Grid>
          <Slider label="Blur" value={e.depthOfField.intensity} min={0} max={12} step={0.5} format={(v) => `${v}px`} onChange={(v) => setFx("depthOfField", { intensity: v })} />
          <div className={`${card} px-3 py-2.5`}>
            <p className="mb-2 text-sm">Focus</p>
            <Segmented
              label="Focus"
              value={e.depthOfField.mode}
              onChange={(v) => setFx("depthOfField", { mode: v })}
              options={[
                { value: "center", label: "Centre" },
                { value: "cursor", label: "Cursor" },
              ]}
            />
          </div>
        </Grid>
      );
    case "motionBlur":
      return (
        <Grid>
          <Slider label="Strength" value={e.motionBlur.strength} format={pct} onChange={(v) => setFx("motionBlur", { strength: v })} />
        </Grid>
      );
    case "halation":
      return (
        <Grid>
          <Slider label="Strength" value={e.halation.strength} format={pct} onChange={(v) => setFx("halation", { strength: v })} />
        </Grid>
      );
    case "bloom":
      return (
        <Grid>
          <Slider label="Intensity" value={e.bloom.intensity} format={pct} onChange={(v) => setFx("bloom", { intensity: v })} />
          <Slider label="Threshold" value={e.bloom.threshold} format={pct} onChange={(v) => setFx("bloom", { threshold: v })} help="How bright a pixel must be before it glows. Higher = only the brightest highlights." />
        </Grid>
      );
    case "letterbox":
      return (
        <div className={`${card} px-3 py-2.5`}>
          <p className="mb-2 text-sm">Aspect ratio</p>
          <Segmented label="Aspect ratio" value={e.letterbox.ratio} onChange={(v) => setFx("letterbox", { ratio: v })} options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))} />
        </div>
      );
    case "timeRemap":
      return (
        <Grid>
          <Slider label="Strength" value={e.timeRemap.strength} format={pct} onChange={(v) => setFx("timeRemap", { strength: v })} />
        </Grid>
      );
    case "shutterFlash":
      return <p className="text-xs text-white/45">No settings — a quick white flash and shutter blade on every page transition.</p>;
    case "filmScratch":
      return (
        <Grid>
          <Slider label="Density" value={e.filmScratch.density} format={pct} onChange={(v) => setFx("filmScratch", { density: v })} />
        </Grid>
      );
  }
}

function LutControls({
  c,
  setFx,
  setCine,
  projects,
}: {
  c: CinematicConfig;
  setFx: SetFx;
  setCine: (fn: (c: CinematicConfig) => CinematicConfig) => void;
  projects: Project[];
}) {
  const sample = projects.find((p) => p.thumbnail)?.thumbnail;
  const graded = Object.entries(c.lutProjects);
  const [adding, setAdding] = useState("");
  const setProject = (id: string, preset: LutPreset | null) =>
    setCine((cc) => {
      const next = { ...cc.lutProjects };
      if (preset) next[id] = preset;
      else delete next[id];
      return { ...cc, lutProjects: next };
    });

  return (
    <div className="flex flex-col gap-4">
      <Choice<LutPreset>
        label="Preset"
        value={c.effects.lut.preset}
        onChange={(v) => setFx("lut", { preset: v })}
        columns="sm:grid-cols-4 xl:grid-cols-4"
        options={LUT_PRESETS.map((p) => ({
          value: p,
          label: LUT_LABELS[p],
          preview: <Swatch src={sample} filter={lutFilter(p)} />,
        }))}
      />
      <div>
        <p className={`${micro} mb-2 flex items-center gap-2 text-white/50`}>
          Per-project grades <Help>Overrides the global preset on that project&apos;s card and its page — even when the global LUT is off.</Help>
        </p>
        <ul className="flex flex-col gap-1.5">
          {graded.map(([id, preset]) => (
            <li key={id} className={`${card} flex flex-wrap items-center gap-2 px-2 py-1.5`}>
              <span className="min-w-0 flex-1 truncate text-sm">{projects.find((p) => p.id === id)?.title ?? id}</span>
              <select value={preset} onChange={(e) => setProject(id, e.target.value as LutPreset)} className={`${input} w-40`} aria-label="Preset">
                {LUT_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {LUT_LABELS[p]}
                  </option>
                ))}
              </select>
              <button type="button" className={btn} onClick={() => setProject(id, null)} aria-label="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <select value={adding} onChange={(e) => setAdding(e.target.value)} className={`${input} max-w-xs`} aria-label="Project to grade">
            <option value="">Choose a project…</option>
            {projects
              .filter((p) => !(p.id in c.lutProjects))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
          <button
            type="button"
            className={btn}
            disabled={!adding}
            onClick={() => {
              setProject(adding, c.effects.lut.preset === "none" ? "kodak" : c.effects.lut.preset);
              setAdding("");
            }}
          >
            + Add grade
          </button>
        </div>
      </div>
    </div>
  );
}

function Swatch({ src, filter, style }: { src?: string; filter: string; style?: CSSProperties }) {
  return (
    <span className="relative block aspect-video overflow-hidden bg-[linear-gradient(135deg,#ff8a3d,#3dd9ff_55%,#141414)]" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element -- admin swatch of an arbitrary blob URL */}
      {src && <img src={src} alt="" className="absolute inset-0 size-full object-cover" style={{ filter: filter || undefined }} />}
      {!src && <span className="absolute inset-0" style={{ filter: filter || undefined, background: "inherit" }} />}
    </span>
  );
}

function ScopePicker({ rule, onChange }: { rule: ScopeRule; onChange: (r: ScopeRule) => void }) {
  return (
    <div className={`${card} px-3 py-2.5`}>
      <p className="mb-2 flex items-center gap-2 text-sm">
        Scope
        <Help>Global: everywhere. Hero: only while the hero fills the screen. Sections: everywhere past the hero. Specific: only while one of the chosen home sections is centred.</Help>
      </p>
      <Segmented
        label="Scope"
        value={rule.scope}
        onChange={(scope) => onChange({ ...rule, scope })}
        options={[
          { value: "global", label: "Global" },
          { value: "hero", label: "Hero" },
          { value: "sections", label: "Sections" },
          { value: "specific", label: "Specific" },
        ]}
      />
      {rule.scope === "specific" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SECTION_IDS.map((s) => {
            const on = rule.sections.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...rule, sections: on ? rule.sections.filter((x) => x !== s) : [...rule.sections, s] })}
                className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${on ? "border-[#e7fe55] text-[#e7fe55]" : "border-white/15 text-white/45 hover:text-white"}`}
              >
                {SECTION_LABELS[s]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A small CSS rendition of the effect so the change reads before the dock catches up. */
function Demo({ id, c }: { id: EffectId; c: CinematicConfig }) {
  const e = c.effects;
  const frame = (children: ReactNode, style?: CSSProperties) => (
    <div className="relative aspect-video overflow-hidden border border-white/10 bg-[radial-gradient(80%_70%_at_30%_30%,#2a2a2a,#0b0b0b)]" style={style}>
      <span className="absolute inset-0 flex items-center justify-center text-4xl font-black uppercase tracking-tight text-white/90">3skrino</span>
      {children}
    </div>
  );
  let body: ReactNode;
  switch (id) {
    case "chromatic": {
      const px = 0.4 + e.chromatic.strength * 4.6;
      body = (
        <div className="relative flex aspect-video items-center justify-center border border-white/10 bg-[#0b0b0b]">
          <span className="text-4xl font-black uppercase" style={{ textShadow: `${-px}px 0 rgb(255 40 80 / .55), ${px}px 0 rgb(0 210 255 / .5)` }}>
            3skrino
          </span>
        </div>
      );
      break;
    }
    case "vhs":
      body = frame(
        <>
          <div className="fx-vhs-scan absolute inset-0" style={{ "--fx-scan": (e.vhs.scanlines * 0.45).toFixed(2) } as CSSProperties} />
          <div className="fx-vhs-track absolute inset-x-0 top-0" style={{ opacity: e.vhs.tracking, height: "30%" }} />
        </>,
      );
      break;
    case "crt":
      body = frame(<div className="fx-crt absolute inset-0" style={{ "--crt-curve": e.crt.curve, "--crt-glow": e.crt.glow, "--crt-trails": e.crt.trails } as CSSProperties} />);
      break;
    case "bars":
      body = frame(
        <>
          <div className="absolute inset-x-0 top-0 bg-black" style={{ height: `${e.bars.height * 1.8}%`, opacity: e.bars.opacity }} />
          <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: `${e.bars.height * 1.8}%`, opacity: e.bars.opacity }} />
        </>,
      );
      break;
    case "letterbox": {
      const r = { "2.39:1": 2.39, "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1 }[e.letterbox.ratio];
      const pillar = 16 / 9 > r;
      const m = pillar ? ((1 - r / (16 / 9)) / 2) * 100 : ((1 - 16 / 9 / r) / 2) * 100;
      body = frame(
        pillar ? (
          <>
            <div className="absolute inset-y-0 left-0 bg-black" style={{ width: `${m}%` }} />
            <div className="absolute inset-y-0 right-0 bg-black" style={{ width: `${m}%` }} />
          </>
        ) : (
          <>
            <div className="absolute inset-x-0 top-0 bg-black" style={{ height: `${m}%` }} />
            <div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: `${m}%` }} />
          </>
        ),
      );
      break;
    }
    case "glitch":
      body = frame(
        <>
          {[18, 46, 71].map((top, i) => (
            <div
              key={top}
              className="absolute"
              style={{
                top: `${top}%`,
                left: `${10 + i * 18}%`,
                width: `${40 + i * 10}%`,
                height: e.glitch.blockSize * 0.6,
                transform: `translateX(${(i % 2 ? 1 : -1) * e.glitch.strength * 30}px)`,
                backdropFilter: "hue-rotate(120deg) saturate(2.5)",
                background: "rgb(0 255 220 / 0.07)",
              }}
            />
          ))}
        </>,
      );
      break;
    case "lightLeaks":
      body = frame(
        <div className="absolute inset-0 mix-blend-screen" style={{ background: "radial-gradient(60% 60% at 10% 15%, rgb(255 122 47 / .45), transparent 60%), radial-gradient(50% 50% at 92% 30%, rgb(255 61 110 / .35), transparent 60%)" }} />,
      );
      break;
    case "depthOfField":
      body = frame(
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: `blur(${e.depthOfField.intensity}px)`,
            maskImage: "radial-gradient(circle at 50% 50%, transparent 0, transparent 22%, black 58%)",
            WebkitMaskImage: "radial-gradient(circle at 50% 50%, transparent 0, transparent 22%, black 58%)",
          }}
        />,
      );
      break;
    case "motionBlur":
      body = frame(<div className="absolute inset-0" style={{ backdropFilter: `blur(${e.motionBlur.strength * 6}px)` }} />);
      break;
    case "filmGrain":
      body = frame(
        <svg className="absolute inset-0 size-full mix-blend-overlay" style={{ opacity: Math.min(1, e.filmGrain.intensity * 4) }} aria-hidden>
          <filter id="demo-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#demo-grain)" />
        </svg>,
      );
      break;
    case "filmScratch":
      body = frame(
        <svg className="absolute inset-0 size-full" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden>
          {Array.from({ length: Math.round(2 + e.filmScratch.density * 6) }, (_, i) => (
            <line key={i} x1={(i * 37) % 160} y1="0" x2={((i * 37) % 160) + 1.5} y2="90" stroke="white" strokeOpacity="0.35" strokeWidth="0.3" />
          ))}
        </svg>,
      );
      break;
    case "bloom":
    case "halation": {
      const s = id === "bloom" ? e.bloom.intensity : e.halation.strength;
      const color = id === "bloom" ? "255 255 255" : "255 70 30";
      body = (
        <div className="relative flex aspect-video items-center justify-center border border-white/10 bg-[#0b0b0b]">
          <span className="text-4xl font-black uppercase text-white" style={{ textShadow: `0 0 ${4 + s * 14}px rgb(${color} / ${0.3 + s * 0.5}), 0 0 ${12 + s * 30}px rgb(${color} / ${s * 0.45})` }}>
            3skrino
          </span>
        </div>
      );
      break;
    }
    case "lut":
      body = <Swatch filter={lutFilter(e.lut.preset)} />;
      break;
    default:
      body = (
        <div className="flex aspect-video items-center justify-center border border-dashed border-white/10 p-4 text-center">
          <span className={`${micro} text-white/30`}>This one moves with scrolling or navigation — try it in the preview dock</span>
        </div>
      );
  }
  return (
    <div>
      <p className={`${micro} mb-1.5 text-white/35`}>Sketch</p>
      {body}
    </div>
  );
}
