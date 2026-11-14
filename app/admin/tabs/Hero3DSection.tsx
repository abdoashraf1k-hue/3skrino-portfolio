"use client";

import { useState } from "react";
import MiniPreview from "@/components/admin/MiniPreview";
import { btn, btnPrimary, ColorField, micro, Section, Segmented, Slider, Toggle } from "@/components/admin/ui";
import type { Hero3DConfig, HeroFloatingType } from "@/data/hero-config";
import { DEFAULT_MODEL3D, HERO3D_PALETTES } from "@/data/hero-defaults";
import { randomSeed } from "@/store/heroStore";
import { useConfigStore } from "../store";

const FLOATING: { value: HeroFloatingType; label: string }[] = [
  { value: "fish", label: "Fish school" },
  { value: "orbs", label: "Orbs" },
  { value: "shards", label: "Shards" },
  { value: "cubes", label: "Cubes" },
];


const sameTheme = (a: Hero3DConfig["theme"], b: Hero3DConfig["theme"]) =>
  a.primary === b.primary && a.secondary === b.secondary && a.background === b.background;

/**
 * Poses → Hero 3D controls (Sprint 13): the 360° image sequence, theme and
 * floating orbit of the "3D model" hero. Every change edits the hero draft:
 * the preview below (and the dock) receive it instantly, where the 3D hero
 * hydrates its Zustand store and the scene eases to it inside useFrame — no
 * reload, no re-render per frame. "Save" commits data/hero-config.ts → model3d.
 */
export default function Hero3DSection() {
  const { hero, setHero, site, setSite } = useConfigStore();
  const [live, setLive] = useState(true);
  if (!hero || !site) return null;
  const m = hero.model3d;
  const set = (patch: Partial<Hero3DConfig>) => setHero((c) => ({ ...c, model3d: { ...c.model3d, ...patch } }));
  const setTheme = (patch: Partial<Hero3DConfig["theme"]>) => set({ theme: { ...m.theme, ...patch } });
  const frames = m.sequenceImages;

  const paletteIndex = HERO3D_PALETTES.findIndex((p) => sameTheme(p.theme, m.theme));
  const nextTheme = () => set({ theme: HERO3D_PALETTES[(paletteIndex + 1) % HERO3D_PALETTES.length].theme });
  const isLive = site.heroVariant === "model3d";

  return (
    <Section
      title="Hero 3D controls"
      hint="the 360° photo hero · changes preview live · save to publish"
      onReset={() => set({ ...DEFAULT_MODEL3D, sequenceImages: m.sequenceImages })}
      aside={<Toggle label="Live preview" checked={live} onChange={setLive} />}
    >
      {!isLive && (
        <p className={`${micro} mb-4 flex flex-wrap items-center gap-3 border border-[#ffb54d]/40 bg-[#ffb54d]/10 p-3 text-[#ffcf8a]`}>
          The home page currently uses another hero — these settings apply to “3D model”.
          <button type="button" className={btn} onClick={() => setSite((c) => ({ ...c, heroVariant: "model3d" }))}>
            Make it the hero
          </button>
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="flex min-w-0 flex-col gap-5">
          <p className={`${micro} border border-white/10 bg-white/[0.02] p-3 leading-relaxed text-white/50`}>
            The 360° image sequence and the AI Reality Engine moved to <span className="text-[#e7fe55]">Genesis hero</span> (above) — this hero turns the same frames.
            {frames.length > 0 ? ` ${frames.length} frames loaded.` : " No sequence yet: the centre pose shows as a still."}
          </p>

          <div>
            <span className={`${micro} mb-2 flex items-center justify-between text-white/50`}>
              <span>Theme</span>
              <span className="text-white/35">{paletteIndex >= 0 ? HERO3D_PALETTES[paletteIndex].name : "Custom"}</span>
            </span>
            <div className="grid gap-2 sm:grid-cols-3">
              <ColorField label="Primary" value={m.theme.primary} onChange={(primary) => setTheme({ primary })} />
              <ColorField label="Secondary" value={m.theme.secondary} onChange={(secondary) => setTheme({ secondary })} />
              <ColorField label="Background" value={m.theme.background} onChange={(background) => setTheme({ background })} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={nextTheme}>
                ✦ New theme
              </button>
              {HERO3D_PALETTES.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  title={p.name}
                  aria-label={`Palette ${p.name}`}
                  aria-pressed={i === paletteIndex}
                  onClick={() => set({ theme: p.theme })}
                  className={`flex h-8 w-12 overflow-hidden border ${i === paletteIndex ? "border-[#e7fe55]" : "border-white/15 hover:border-white/40"}`}
                  style={{ background: p.theme.background }}
                >
                  <span className="m-1.5 flex-1" style={{ background: p.theme.primary }} />
                  <span className="my-1.5 mr-1.5 flex-1" style={{ background: p.theme.secondary }} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={`${micro} mb-2 block text-white/50`}>Floating objects</span>
            <Segmented label="Floating object type" value={m.floatingType} options={FLOATING} onChange={(floatingType) => set({ floatingType })} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Slider
              label="Orbit drift"
              hint="extra spin of the orbit · 0 = it only turns with you"
              min={0}
              max={5}
              step={0.05}
              format={(v) => v.toFixed(2)}
              value={m.rotateSpeed}
              onChange={(rotateSpeed) => set({ rotateSpeed })}
            />
            <Slider
              label="Orbit count"
              hint="instances · one draw call"
              min={100}
              max={500}
              step={10}
              format={(v) => String(Math.round(v))}
              value={m.count}
              onChange={(count) => set({ count })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnPrimary} onClick={() => set({ seed: randomSeed() })}>
              ⟳ Regenerate orbit
            </button>
            <span className={`${micro} text-white/35`}>seed {m.seed} · new radii, speeds and phases</span>
          </div>

          <Toggle label="Post-processing" hint="bloom · depth of field · grain · vignette on the orbit" checked={m.postFx} onChange={(postFx) => set({ postFx })} />
        </div>

        <div className="min-w-0">
          <MiniPreview path="/?heroVariant=model3d" hero={hero} site={site} enabled={live} title="3D hero preview" />
          <p className={`${micro} mt-2 text-white/35`}>The real home page with your unsaved draft.</p>
        </div>
      </div>
    </Section>
  );
}
