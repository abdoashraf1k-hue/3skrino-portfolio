"use client";

import { useState, type ChangeEvent, type CSSProperties } from "react";
import { ListEditor, NumberField } from "@/components/admin/fields";
import { btn, card, Field, input, micro, Section, TabHeader, Toggle } from "@/components/admin/ui";
import { brandConfig as factory, type BrandConfig, type SignatureMoments } from "@/data/brand";
import { assertLogoFile, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { brandCss } from "@/lib/brand";
import { useConfigStore } from "../store";

type Props = { adminKey: string; onError: (m: string) => void; onSuccess: (m: string) => void };

const SIGNATURE: { key: keyof SignatureMoments; label: string; hint: string }[] = [
  { key: "slateWipe", label: "Slate wipe", hint: "page transition — a clapperboard slate (scene · take) crosses the screen" },
  { key: "magneticCtas", label: "Magnetic CTAs", hint: "primary buttons lean toward the cursor, like a focus pull" },
  { key: "scrollTimecode", label: "Scroll timecode", hint: "a running SMPTE timecode in the corner, driven by scroll" },
  { key: "leaderCountdown", label: "Leader countdown", hint: "first visit: a 3-2-1 film leader (once per session)" },
  { key: "rackFocus", label: "Rack-focus rings", hint: "keyboard focus pulls from blur to a sharp accent outline" },
];

const LOGO_SLOTS: { key: keyof BrandConfig["identity"]["logos"]; label: string }[] = [
  { key: "primary", label: "Primary logo" },
  { key: "mark", label: "Mark / monogram" },
  { key: "mono", label: "Mono (one colour)" },
];

/** A printable brand-guidelines page built from the current draft. */
function guidelinesHtml(b: BrandConfig): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const li = (xs: string[]) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const active = b.palettes.items.find((p) => p.id === b.palettes.active) ?? b.palettes.items[0];
  const swatches = active
    ? (["bg", "bgSoft", "fg", "accent", "accent2"] as const)
        .map((k) => `<div class="sw"><span style="background:${active[k]}"></span>${k}<br><code>${active[k]}</code></div>`)
        .join("")
    : "";
  const steps = [-2, -1, 0, 1, 2, 3, 4, 5, 6].map((k) => `<p style="font-size:${((b.scale.typeBase * b.scale.typeRatio ** k) / 16).toFixed(3)}rem;margin:.2em 0">Step ${k} — ${esc(b.identity.name)}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(b.identity.name)} — brand guidelines</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:860px;margin:48px auto;padding:0 24px;color:#111}h1{font-size:48px;margin:0}h2{margin-top:48px;border-bottom:1px solid #ddd;padding-bottom:6px}.sw{display:inline-block;width:120px;margin:0 12px 12px 0;font-size:12px}.sw span{display:block;height:64px;border:1px solid #ccc;margin-bottom:6px}code{font-size:12px}</style></head><body>
<h1>${esc(b.identity.name)}</h1><p><em>${esc(b.identity.tagline)}</em></p><p>${esc(b.identity.mission)}</p>
<h2>Voice</h2><p>${esc(b.voice.summary)}</p><p><strong>Traits</strong></p>${li(b.voice.traits)}<p><strong>Do</strong></p>${li(b.voice.do)}<p><strong>Don't</strong></p>${li(b.voice.dont)}
<h2>Colour — ${esc(active?.name ?? "")}</h2>${swatches}
<h2>Type scale</h2><p>Base ${b.scale.typeBase}px, ratio ${b.scale.typeRatio}</p>${steps}
<h2>Spacing</h2><p>Unit ${b.scale.unit}px · steps ${b.scale.steps.join(", ")} · grid ${b.scale.grid.columns} columns, ${b.scale.grid.gutter}px gutter, max ${b.scale.grid.maxWidth}px · radius ${b.scale.radius.sm}/${b.scale.radius.md}/${b.scale.radius.lg}px</p>
<h2>Motion</h2><p>fast ${b.motion.fast}ms · base ${b.motion.base}ms · slow ${b.motion.slow}ms · cinematic ${b.motion.cinematic}ms<br>ease <code>${esc(b.motion.ease)}</code> · in-out <code>${esc(b.motion.easeInOut)}</code></p>${li(b.motion.principles)}
<h2>Iconography</h2><p>${esc(b.principles.iconography)}</p><h2>Imagery</h2><p>${esc(b.principles.imagery)}</p>
</body></html>`;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BrandTab({ adminKey, onError, onSuccess }: Props) {
  const { brand, setBrand, brandFallback } = useConfigStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  if (!brand) return null;

  const patch = <K extends keyof BrandConfig>(k: K, v: Partial<BrandConfig[K]>) => setBrand((c) => ({ ...c, [k]: { ...c[k], ...v } }));
  const b = brand;

  const uploadLogo = async (slot: keyof BrandConfig["identity"]["logos"], e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      assertLogoFile(file);
      setBusy(slot);
      const url = await uploadHeroAsset(file, "brands", `logo-${slot}`, adminKey);
      patch("identity", { logos: { ...b.identity.logos, [slot]: url } });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  // Live token preview: the same CSS the site gets, scoped to this panel.
  const preview = brandCss(b).replace(/:root\{/, ".brand-preview{");
  const durs = [
    { key: "fast", label: "Fast", min: 40, max: 600 },
    { key: "base", label: "Base", min: 80, max: 1200 },
    { key: "slow", label: "Slow", min: 200, max: 2400 },
    { key: "cinematic", label: "Cinematic", min: 400, max: 4000 },
  ] as const;

  return (
    <div>
      <style>{preview}</style>
      <TabHeader
        title="Brand"
        hint="one source of truth (data/brand.ts) · tokens feed every page as CSS variables · the preview updates as you type"
        actions={
          <>
            <button type="button" className={btn} onClick={() => download(`${b.identity.name.toLowerCase()}-brand-guidelines.html`, guidelinesHtml(b), "text/html")}>
              Export guidelines
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                void navigator.clipboard?.writeText(JSON.stringify(b, null, 2)).then(() => onSuccess("Brand JSON copied"));
              }}
            >
              Copy JSON
            </button>
          </>
        }
      />
      {brandFallback && (
        <p className={`${micro} mb-6 border border-[#ffb54d]/40 px-3 py-2 text-[#ffb54d]`}>
          data/brand.ts isn&apos;t on GitHub yet — you&apos;re editing the bundled copy. Push this release, then saves go through.
        </p>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="min-w-0">
          <Section title="Identity" onReset={() => setBrand((c) => ({ ...c, identity: factory.identity }))}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name" counter={[b.identity.name.length, 40]}>
                <input className={input} value={b.identity.name} maxLength={40} onChange={(e) => patch("identity", { name: e.target.value })} />
              </Field>
              <Field label="Tagline" counter={[b.identity.tagline.length, 140]}>
                <input className={input} value={b.identity.tagline} maxLength={140} onChange={(e) => patch("identity", { tagline: e.target.value })} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Mission" counter={[b.identity.mission.length, 400]}>
                  <textarea rows={2} className={input} value={b.identity.mission} maxLength={400} onChange={(e) => patch("identity", { mission: e.target.value })} />
                </Field>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {LOGO_SLOTS.map((slot) => (
                <div key={slot.key} className={`${card} flex items-center gap-3 p-2`}>
                  <span className="flex size-14 shrink-0 items-center justify-center bg-black/50 text-[10px] text-white/40">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                    {b.identity.logos[slot.key] ? <img src={b.identity.logos[slot.key]} alt="" className="max-h-12 max-w-12 object-contain" /> : "type"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`${micro} block text-white/50`}>{slot.label}</span>
                    <span className="mt-1 flex gap-1">
                      <label className={`${btn} cursor-pointer`}>
                        {busy === slot.key ? "…" : "Upload"}
                        <input type="file" accept="image/png,image/svg+xml,image/webp" className="sr-only" onChange={(e) => void uploadLogo(slot.key, e)} />
                      </label>
                      {b.identity.logos[slot.key] && (
                        <button type="button" className={btn} onClick={() => patch("identity", { logos: { ...b.identity.logos, [slot.key]: "" } })}>
                          Clear
                        </button>
                      )}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Voice & tone" hint="how the site talks — the Text tab is where the words live" onReset={() => setBrand((c) => ({ ...c, voice: factory.voice }))}>
            <Field label="Summary">
              <textarea rows={2} className={input} value={b.voice.summary} maxLength={400} onChange={(e) => patch("voice", { summary: e.target.value })} />
            </Field>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <ListEditor label="Traits" items={b.voice.traits} max={12} maxLength={60} onChange={(traits) => patch("voice", { traits })} />
              <ListEditor label="Do" items={b.voice.do} onChange={(d) => patch("voice", { do: d })} />
              <ListEditor label="Don't" items={b.voice.dont} onChange={(dont) => patch("voice", { dont })} />
            </div>
          </Section>

          <Section title="Grid, spacing & type" onReset={() => setBrand((c) => ({ ...c, scale: factory.scale }))}>
            <div className="grid gap-2 md:grid-cols-2">
              <NumberField label="Spacing unit" unit="px" min={2} max={12} value={b.scale.unit} onChange={(unit) => patch("scale", { unit })} />
              <NumberField label="Body size" unit="px" min={12} max={22} step={0.5} value={b.scale.typeBase} onChange={(typeBase) => patch("scale", { typeBase })} />
              <NumberField label="Type ratio" min={1.1} max={1.618} step={0.001} value={b.scale.typeRatio} onChange={(typeRatio) => patch("scale", { typeRatio })} hint="1.2 minor third · 1.25 major third · 1.333 fourth · 1.618 golden" />
              <NumberField label="Grid columns" min={4} max={24} value={b.scale.grid.columns} onChange={(columns) => patch("scale", { grid: { ...b.scale.grid, columns } })} />
              <NumberField label="Gutter" unit="px" min={0} max={80} value={b.scale.grid.gutter} onChange={(gutter) => patch("scale", { grid: { ...b.scale.grid, gutter } })} />
              <NumberField label="Max width" unit="px" min={960} max={2560} step={10} value={b.scale.grid.maxWidth} onChange={(maxWidth) => patch("scale", { grid: { ...b.scale.grid, maxWidth } })} />
              {(["sm", "md", "lg"] as const).map((k) => (
                <NumberField key={k} label={`Radius ${k}`} unit="px" min={0} max={k === "lg" ? 60 : 40} value={b.scale.radius[k]} onChange={(v) => patch("scale", { radius: { ...b.scale.radius, [k]: v } })} />
              ))}
            </div>
            <Field label="Spacing steps (× unit, comma-separated)">
              <input
                className={`${input} mt-2 font-mono`}
                defaultValue={b.scale.steps.join(", ")}
                key={b.scale.steps.join(",")}
                onBlur={(e) => {
                  const steps = e.target.value
                    .split(/[,\s]+/)
                    .map(Number)
                    .filter((n) => Number.isFinite(n) && n >= 0)
                    .slice(0, 16);
                  if (steps.length >= 4) patch("scale", { steps });
                }}
              />
            </Field>
          </Section>

          <Section title="Motion" hint="durations + easings every transition uses" onReset={() => setBrand((c) => ({ ...c, motion: factory.motion }))}>
            <div className="grid gap-2 md:grid-cols-2">
              {durs.map((d) => (
                <NumberField key={d.key} label={d.label} unit="ms" min={d.min} max={d.max} step={10} value={b.motion[d.key]} onChange={(v) => patch("motion", { [d.key]: v })} />
              ))}
              <Field label="Ease (out)">
                <input className={`${input} font-mono`} value={b.motion.ease} onChange={(e) => patch("motion", { ease: e.target.value })} />
              </Field>
              <Field label="Ease (in-out)">
                <input className={`${input} font-mono`} value={b.motion.easeInOut} onChange={(e) => patch("motion", { easeInOut: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3">
              <ListEditor label="Motion principles" items={b.motion.principles} max={12} onChange={(principles) => patch("motion", { principles })} />
            </div>
          </Section>

          <Section title="Interaction states" hint="one hover / press / focus pattern for every control" onReset={() => setBrand((c) => ({ ...c, states: factory.states }))}>
            <div className="grid gap-2 md:grid-cols-2">
              <NumberField label="Hover lift" unit="px" min={0} max={8} step={0.5} value={b.states.hoverLift} onChange={(hoverLift) => patch("states", { hoverLift })} />
              <NumberField label="Press scale" min={0.9} max={1} step={0.005} value={b.states.pressScale} onChange={(pressScale) => patch("states", { pressScale })} />
              <NumberField label="Focus ring width" unit="px" min={1} max={4} step={0.5} value={b.states.focusWidth} onChange={(focusWidth) => patch("states", { focusWidth })} />
              <NumberField label="Focus ring offset" unit="px" min={0} max={6} step={0.5} value={b.states.focusOffset} onChange={(focusOffset) => patch("states", { focusOffset })} />
            </div>
          </Section>

          <Section title="Iconography & imagery" onReset={() => setBrand((c) => ({ ...c, principles: factory.principles }))}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Iconography">
                <textarea rows={3} className={input} value={b.principles.iconography} maxLength={600} onChange={(e) => patch("principles", { iconography: e.target.value })} />
              </Field>
              <Field label="Imagery">
                <textarea rows={3} className={input} value={b.principles.imagery} maxLength={600} onChange={(e) => patch("principles", { imagery: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Signature moments" hint="the interactions that make the site recognisably 3SKRINO · each respects reduced motion">
            <div className="grid gap-2 md:grid-cols-2">
              {SIGNATURE.map((s) => (
                <Toggle key={s.key} label={s.label} hint={s.hint} checked={b.signature[s.key]} onChange={(v) => patch("signature", { [s.key]: v })} />
              ))}
            </div>
          </Section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <Section title="Live tokens">
            <div className="brand-preview flex flex-col gap-5 border border-white/10 bg-[#0a0a0a] p-5">
              <div>
                <p className="font-black uppercase leading-none tracking-tight" style={{ fontSize: "var(--step-5)" }}>
                  {b.identity.name}
                </p>
                <p className="mt-2 text-white/60" style={{ fontSize: "var(--step-1)" }}>
                  {b.identity.tagline}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                {[4, 3, 2, 1, 0, -1].map((k) => (
                  <p key={k} className="truncate" style={{ fontSize: `var(--step-${k < 0 ? `n${-k}` : k})` }}>
                    <span className="mr-3 font-mono text-[10px] text-white/30">{k}</span>Cut to the feeling
                  </p>
                ))}
              </div>
              <div className="flex items-end gap-1" aria-label="Spacing steps">
                {b.scale.steps.map((s, i) => (
                  <span key={i} className="bg-[#e7fe55]/70" style={{ width: `var(--space-${i})`, height: `var(--space-${i})`, minWidth: 1, minHeight: 1 }} title={`space-${i}`} />
                ))}
              </div>
              <div className="flex gap-2">
                {(["sm", "md", "lg"] as const).map((r) => (
                  <span key={r} className="flex size-14 items-center justify-center border border-white/30 font-mono text-[10px] text-white/50" style={{ borderRadius: `var(--radius-${r})` }}>
                    {r}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onPointerDown={() => setPressed(true)}
                onPointerUp={() => setPressed(false)}
                onPointerLeave={() => setPressed(false)}
                className="brand-state-demo self-start border border-white/40 px-5 py-2.5 font-mono text-[11px] uppercase tracking-widest"
                style={{ transform: pressed ? "scale(var(--press-scale))" : undefined } as CSSProperties}
              >
                Hover, press, tab to me
              </button>
              <div className="flex flex-col gap-2">
                {durs.map((d) => (
                  <div key={d.key} className="group relative h-6 border-b border-white/10">
                    <span className={`${micro} text-[9px] text-white/40`}>
                      {d.label} {b.motion[d.key]}ms
                    </span>
                    <span className="brand-ball absolute right-0 top-1 size-3 rounded-full bg-[#e7fe55]" style={{ animationDuration: `var(--dur-${d.key})` }} />
                  </div>
                ))}
              </div>
            </div>
            <style>{`.brand-state-demo{transition:transform var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out)}.brand-state-demo:hover{transform:translateY(calc(var(--hover-lift) * -1));border-color:#e7fe55}.brand-state-demo:focus-visible{outline:var(--focus-width) solid #e7fe55;outline-offset:var(--focus-offset)}@keyframes brand-ball{from{right:100%}to{right:0}}.brand-ball{animation:brand-ball 1s var(--ease-out) infinite alternate}@media (prefers-reduced-motion: reduce){.brand-ball{animation:none}}`}</style>
          </Section>
        </aside>
      </div>
    </div>
  );
}
