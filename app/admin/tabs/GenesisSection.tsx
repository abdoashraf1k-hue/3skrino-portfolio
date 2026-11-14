"use client";

import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import AngleEnginePanel from "@/components/admin/AngleEnginePanel";
import MiniPreview from "@/components/admin/MiniPreview";
import { btn, btnDanger, btnPrimary, ColorField, input, micro, Section, Segmented, Slider, Toggle } from "@/components/admin/ui";
import type { GenesisBackground, GenesisConfig, GenesisGravity, GenesisPalette, SequenceFrame } from "@/data/hero-config";
import { CALIBRATION_RANGE, DEFAULT_GENESIS, DEFAULT_GENESIS_PALETTE } from "@/data/hero-defaults";
import { site as identity } from "@/data/site";
import { assertLogoFile, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { sameOriginMedia } from "@/lib/media-url";
import { saveCalibration } from "../calibration-action";
import { useConfigStore } from "../store";
import { generateHeroTheme } from "../theme-action";

const signed = (v: number) => `${v > 0 ? "+" : ""}${v}°`;

const BACKGROUNDS: { value: GenesisBackground; label: string; note: string }[] = [
  { value: "celestial-nebula", label: "Celestial nebula", note: "domain-warped simplex fbm · warps toward the mouse" },
  { value: "neon-ring-field", label: "Neon ring field", note: "rotating neon rings · film grain" },
  { value: "liquid-metal", label: "Liquid metal", note: "chrome height field · Fresnel · refraction" },
  { value: "calm-dark", label: "Calm dark", note: "a slowly breathing radial gradient" },
];

const GRAVITY: { value: GenesisGravity; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "repel", label: "Repel" },
  { value: "attract", label: "Attract" },
];

const PROMPTS = ["Vaporwave", "Matrix Green", "Cyberpunk Tokyo", "Blood Moon", "Arctic chrome", "Gold luxury"];

const PALETTE_FIELDS: { key: keyof GenesisPalette; label: string }[] = [
  { key: "grid", label: "Grid" },
  { key: "glow", label: "Glow" },
  { key: "tint", label: "Shader tint" },
  { key: "accent", label: "Accent / horizon" },
  { key: "background", label: "Stage" },
];

/**
 * Poses → Genesis (Sprint 15): everything the primary hero paints with.
 * Every control edits the hero draft, which the preview below receives
 * instantly; Save commits data/hero-config.ts → genesis. Sprint 15.5: the
 * 360° sequence + AI Reality Engine live here too (the shared
 * AngleEnginePanel), plus the mouse calibration (saved on its own by a server
 * action), the hologram shader's controls and the site-wide watermark.
 */
export default function GenesisSection({ adminKey, onError }: { adminKey: string; onError: (m: string) => void }) {
  const { hero, setHero, site, setSite, savedHero, markHeroSaved } = useConfigStore();
  const [live, setLive] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [applyBackdrop, setApplyBackdrop] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [upload, setUpload] = useState<string | null>(null);
  const [calibrating, startCalibrating] = useTransition();
  const [calibrationNote, setCalibrationNote] = useState<string | null>(null);
  if (!hero || !site) return null;

  const g = hero.genesis;
  const set = (patch: Partial<GenesisConfig>) => setHero((c) => ({ ...c, genesis: { ...c.genesis, ...patch } }));
  const setPalette = (patch: Partial<GenesisPalette>) => setHero((c) => ({ ...c, genesis: { ...c.genesis, palette: { ...c.genesis.palette, ...patch } } }));
  const isLive = site.heroVariant === "genesis";
  const current = BACKGROUNDS.find((b) => b.value === g.background);
  const setFrames = (fn: (l: SequenceFrame[]) => SequenceFrame[]) =>
    setHero((c) => ({ ...c, model3d: { ...c.model3d, sequenceImages: fn(c.model3d.sequenceImages) } }));
  const savedOffset = savedHero?.genesis.calibrationOffset ?? 0;

  /** Commits only genesis.calibrationOffset (server action); other unsaved edits stay drafts. */
  const persistCalibration = () => {
    const offset = g.calibrationOffset;
    setCalibrationNote(null);
    startCalibrating(async () => {
      const res = await saveCalibration(adminKey, offset);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      // The committed file is now the saved copy; the draft keeps everything else that's unsaved.
      markHeroSaved(res.config);
      setCalibrationNote(`Calibration ${signed(res.offset)} committed to data/hero-config.ts — live after the next deploy`);
    });
  };

  const runPrompt = (text: string) => {
    const mood = text.trim();
    if (!mood) return onError("Type a mood first — e.g. “Vaporwave” or “Matrix Green”");
    setPrompt(mood);
    startTransition(async () => {
      const res = await generateHeroTheme(adminKey, mood);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      const { theme } = res;
      setHero((c) => ({
        ...c,
        genesis: {
          ...c.genesis,
          palette: theme.palette,
          themePrompt: mood,
          background: applyBackdrop && theme.background ? theme.background : c.genesis.background,
        },
      }));
      const by = theme.source === "ai" ? "AI" : theme.source === "preset" ? "preset match" : "generated from your words";
      setResult(`${theme.name} · ${by}${theme.background && applyBackdrop ? ` · backdrop → ${theme.background}` : ""}${res.note ? ` — ${res.note}` : ""}`);
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runPrompt(prompt);
  };

  const onWatermark = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      assertLogoFile(file);
      setUpload("0%");
      const url = await uploadHeroAsset(file, "site", `watermark-${file.name}`, adminKey, (p) => setUpload(`${p}%`));
      set({ customWatermarkUrl: url });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUpload(null);
    }
  };

  return (
    <Section
      title="Genesis hero"
      hint="retro grid · GLSL backdrop · watermark · the 360° glowing head · changes preview live · save to publish"
      onReset={() => set({ ...DEFAULT_GENESIS, customWatermarkUrl: g.customWatermarkUrl, calibrationOffset: g.calibrationOffset })}
      aside={<Toggle label="Live preview" checked={live} onChange={setLive} />}
    >
      {!isLive && (
        <p className={`${micro} mb-4 flex flex-wrap items-center gap-3 border border-[#ffb54d]/40 bg-[#ffb54d]/10 p-3 text-[#ffcf8a]`}>
          The home page currently uses another hero — these settings apply to “Genesis”.
          <button type="button" className={btn} onClick={() => setSite((c) => ({ ...c, heroVariant: "genesis" }))}>
            Make it the hero
          </button>
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Backdrop */}
          <label className="block">
            <span className={`${micro} mb-2 block text-white/50`}>Background shader</span>
            <select
              value={g.background}
              onChange={(e) => set({ background: e.target.value as GenesisBackground })}
              className={`${input} w-full cursor-pointer`}
            >
              {BACKGROUNDS.map((b) => (
                <option key={b.value} value={b.value} className="bg-[#111]">
                  {b.label}
                </option>
              ))}
            </select>
            {current && <span className={`${micro} mt-1.5 block text-white/35`}>{current.note}</span>}
          </label>

          {/* AI Theme Prompt */}
          <div>
            <span className={`${micro} mb-2 flex items-center justify-between text-white/50`}>
              <span>✦ AI theme prompt</span>
              {g.themePrompt && <span className="text-white/35">last: “{g.themePrompt}”</span>}
            </span>
            <form onSubmit={onSubmit} className="flex gap-2">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={120}
                placeholder="Vaporwave · Matrix Green · blood moon over Tokyo…"
                aria-label="Theme prompt"
                className={`${input} min-w-0 flex-1`}
              />
              <button type="submit" className={btnPrimary} disabled={pending}>
                {pending ? "Mapping…" : "Generate"}
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROMPTS.map((p) => (
                <button key={p} type="button" className={btn} disabled={pending} onClick={() => runPrompt(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Toggle label="Also pick the backdrop" hint="let the mood choose the shader preset" checked={applyBackdrop} onChange={setApplyBackdrop} />
            </div>
            {result && <p className={`${micro} mt-2 text-[#e7fe55]`} role="status">{result}</p>}
          </div>

          {/* Palette */}
          <div>
            <span className={`${micro} mb-2 flex items-center justify-between text-white/50`}>
              <span>Palette · CSS variables + shader uniforms</span>
              <button type="button" className="text-white/40 hover:text-white" onClick={() => set({ palette: DEFAULT_GENESIS_PALETTE })}>
                ↺ reset
              </button>
            </span>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {PALETTE_FIELDS.map((f) => (
                <ColorField key={f.key} label={f.label} value={g.palette[f.key]} onChange={(v) => setPalette({ [f.key]: v })} />
              ))}
            </div>
          </div>

          {/* Watermark */}
          <div>
            <span className={`${micro} mb-2 block text-white/50`}>Personal watermark · behind the head · glitch + chromatic aberration + neon · optional site-wide signature</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="relative flex h-14 w-40 items-center justify-center border border-white/10 bg-[#0a0a0a] px-2">
                {g.customWatermarkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={sameOriginMedia(g.customWatermarkUrl)} alt="Watermark" className="max-h-12 max-w-full object-contain" />
                ) : (
                  <span className="type-display text-xl text-white/70">{identity.name}</span>
                )}
                {upload && <span className="absolute inset-0 flex items-center justify-center bg-black/75 font-mono text-[10px] text-[#e7fe55]">{upload}</span>}
              </span>
              <label className={`${btn} cursor-pointer`}>
                {g.customWatermarkUrl ? "Replace logo" : "Upload logo"}
                <input type="file" accept="image/png,image/svg+xml,image/webp" className="sr-only" onChange={(e) => void onWatermark(e)} disabled={Boolean(upload)} />
              </label>
              {g.customWatermarkUrl && (
                <button type="button" className={btnDanger} onClick={() => set({ customWatermarkUrl: "" })}>
                  Use the name instead
                </button>
              )}
            </div>
            <p className={`${micro} mt-1.5 text-white/35`}>transparent PNG / SVG / WebP — its alpha is the neon mask</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Slider
                label="Watermark scale"
                hint="1× = half the stage width"
                min={0.5}
                max={3}
                step={0.05}
                format={(v) => `${v.toFixed(2)}×`}
                value={g.watermarkScale}
                onChange={(watermarkScale) => set({ watermarkScale })}
              />
              <Slider label="Watermark opacity" min={0.1} max={1} step={0.01} value={g.watermarkOpacity} onChange={(watermarkOpacity) => set({ watermarkOpacity })} />
              <Slider label="Glitch" hint="bursts + RGB split" value={g.watermarkGlitch} onChange={(watermarkGlitch) => set({ watermarkGlitch })} />
            </div>
            <div className="mt-2">
              <Toggle
                label="Global watermark"
                hint="a small signature of the logo, bottom-right of every page"
                checked={g.globalWatermark}
                onChange={(globalWatermark) => set({ globalWatermark })}
              />
            </div>
          </div>

          {/* Camera + grid */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle label="Cinematic auto-camera" hint="slow infinite Ken Burns · scale 1 → 1.08 + drifting pan" checked={g.autoCamera} onChange={(autoCamera) => set({ autoCamera })} />
            <Toggle label="Retro grid" hint="the neon floor running into the horizon" checked={g.grid} onChange={(grid) => set({ grid })} />
          </div>

          {/* Head */}
          <div>
            <span className={`${micro} mb-2 block text-white/50`}>Head blend</span>
            <Segmented
              label="Head blend"
              value={g.headMode}
              options={[
                { value: "hologram", label: "Hologram" },
                { value: "cutout", label: "Cutout" },
              ]}
              onChange={(headMode) => set({ headMode })}
            />
            <p className={`${micro} mt-1.5 text-white/35`}>
              hologram: a GLSL projection of every frame — Fresnel rim, scanlines, RGB split, grain; black photo backdrops drop out · cutout: solid head + neon rim
              (needs transparent PNG / WebP frames)
            </p>
            {g.headMode === "hologram" && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Slider label="Fresnel rim" hint="edge glow" value={g.holoFresnel} onChange={(holoFresnel) => set({ holoFresnel })} />
                <Slider label="Scanlines" hint="drift upward" value={g.holoScanlines} onChange={(holoScanlines) => set({ holoScanlines })} />
                <Slider label="Chromatic aberration" hint="RGB split on the edges" value={g.holoAberration} onChange={(holoAberration) => set({ holoAberration })} />
                <Slider label="Projection grain" value={g.holoGrain} onChange={(holoGrain) => set({ holoGrain })} />
              </div>
            )}
          </div>

          {/* Calibration */}
          <div>
            <span className={`${micro} mb-2 flex items-center justify-between text-white/50`}>
              <span>Mouse → angle calibration</span>
              <span className="text-white/35">saved: {signed(savedOffset)}</span>
            </span>
            <Slider
              label="Calibration offset"
              hint="added to the cursor's turn (−1…1 across the window × 180°)"
              min={-CALIBRATION_RANGE}
              max={CALIBRATION_RANGE}
              step={0.5}
              format={(v) => signed(v)}
              value={g.calibrationOffset}
              onChange={(calibrationOffset) => set({ calibrationOffset })}
            />
            <p className={`${micro} mt-1.5 leading-relaxed text-white/35`}>
              Cursor centred → {signed(g.calibrationOffset)} · 10% right of centre → {signed(Math.round((18 + g.calibrationOffset) * 10) / 10)} · right edge →{" "}
              {signed(Math.round((180 + g.calibrationOffset) * 10) / 10)}. Turns too far for a small move? Fill the gaps with the AI engine below — a
              sparse turn snaps to the nearest frame.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} disabled={calibrating || g.calibrationOffset === savedOffset} onClick={persistCalibration}>
                {calibrating ? "Saving…" : "Save calibration"}
              </button>
              <button type="button" className={btn} disabled={g.calibrationOffset === 0} onClick={() => set({ calibrationOffset: 0 })}>
                ↺ 0°
              </button>
              {calibrationNote && (
                <span className={`${micro} text-[#e7fe55]`} role="status">
                  {calibrationNote}
                </span>
              )}
            </div>
          </div>

          {/* 360° sequence + AI engine (shared) */}
          <AngleEnginePanel frames={hero.model3d.sequenceImages} setFrames={setFrames} adminKey={adminKey} onError={onError} />

          {/* Gravity */}
          <div>
            <span className={`${micro} mb-2 block text-white/50`}>Magnetic gravity · brand logos vs the cursor</span>
            <div className="flex flex-wrap items-center gap-4">
              <Segmented label="Magnetic gravity" value={g.gravity} options={GRAVITY} onChange={(gravity) => set({ gravity })} />
              <div className="min-w-56 flex-1">
                <Slider label="Strength" value={g.gravityStrength} disabled={g.gravity === "off"} onChange={(gravityStrength) => set({ gravityStrength })} />
              </div>
            </div>
            <p className={`${micro} mt-1.5 text-white/35`}>frames for each brand (diamond · circle · glitch text) live in Brands</p>
          </div>

        </div>

        <div className="min-w-0">
          <MiniPreview path="/?heroVariant=genesis" hero={hero} site={site} enabled={live} title="Genesis hero preview" />
          <p className={`${micro} mt-2 text-white/35`}>The real home page with your unsaved draft.</p>
        </div>
      </div>
    </Section>
  );
}
