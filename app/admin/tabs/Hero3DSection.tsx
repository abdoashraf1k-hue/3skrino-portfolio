"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import MiniPreview from "@/components/admin/MiniPreview";
import { btn, btnDanger, btnPrimary, ColorField, micro, Section, Segmented, Slider, Toggle } from "@/components/admin/ui";
import type { Hero3DConfig, HeroFloatingType, SequenceFrame } from "@/data/hero-config";
import { DEFAULT_MODEL3D, HERO3D_PALETTES, HERO_SEQUENCE_MAX } from "@/data/hero-defaults";
import { assertSiteImage, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { normAngle } from "@/lib/ai/angle-detector";
import { randomSeed } from "@/store/heroStore";
import { useConfigStore } from "../store";
import AngleEngine, { type PoseMap } from "./AngleEngine";

const FLOATING: { value: HeroFloatingType; label: string }[] = [
  { value: "fish", label: "Fish school" },
  { value: "orbs", label: "Orbs" },
  { value: "shards", label: "Shards" },
  { value: "cubes", label: "Cubes" },
];

/** Parallel uploads for a sequence (each frame is one presigned PUT). */
const UPLOAD_CONCURRENCY = 4;

/** Rotation order: natural filename order, so pose-2 comes before pose-10 and 001 … 036 stay in line. */
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Frame i of n spread evenly over the turn, the first facing the camera. */
const evenAngle = (i: number, n: number) => Math.round(normAngle((i * 360) / n) * 10) / 10;
const deg = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}°`;

const sameTheme = (a: Hero3DConfig["theme"], b: Hero3DConfig["theme"]) =>
  a.primary === b.primary && a.secondary === b.secondary && a.background === b.background;

/**
 * Poses → Hero 3D controls (Sprint 13): the 360° image sequence, theme and
 * floating orbit of the "3D model" hero. Every change edits the hero draft:
 * the preview below (and the dock) receive it instantly, where the 3D hero
 * hydrates its Zustand store and the scene eases to it inside useFrame — no
 * reload, no re-render per frame. "Save" commits data/hero-config.ts → model3d.
 */
export default function Hero3DSection({ adminKey, onError }: { adminKey: string; onError: (m: string) => void }) {
  const { hero, setHero, site, setSite } = useConfigStore();
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  // Sprint 14: detected head poses by frame URL (session only — "Use detected angles" writes them into the frames).
  const [poses, setPoses] = useState<PoseMap>({});
  if (!hero || !site) return null;
  const m = hero.model3d;
  const set = (patch: Partial<Hero3DConfig>) => setHero((c) => ({ ...c, model3d: { ...c.model3d, ...patch } }));
  const setTheme = (patch: Partial<Hero3DConfig["theme"]>) => set({ theme: { ...m.theme, ...patch } });
  const frames = m.sequenceImages;
  const setFrames = (fn: (l: SequenceFrame[]) => SequenceFrame[]) =>
    setHero((c) => ({ ...c, model3d: { ...c.model3d, sequenceImages: fn(c.model3d.sequenceImages) } }));

  const paletteIndex = HERO3D_PALETTES.findIndex((p) => sameTheme(p.theme, m.theme));
  const nextTheme = () => set({ theme: HERO3D_PALETTES[(paletteIndex + 1) % HERO3D_PALETTES.length].theme });
  const isLive = site.heroVariant === "model3d";

  /**
   * Uploads a whole sequence (sorted by filename, angles spread evenly from 0°);
   * it replaces the current one only once every frame is in.
   */
  const uploadSequence = async (list: File[]) => {
    const files = list.filter((f) => f.type.startsWith("image/")).sort(byName);
    if (!files.length) return onError("Drop the sequence's image files (PNG, JPEG or WebP)");
    if (files.length > HERO_SEQUENCE_MAX) return onError(`At most ${HERO_SEQUENCE_MAX} frames — this has ${files.length}`);
    try {
      files.forEach(assertSiteImage);
    } catch (err) {
      return onError(err instanceof Error ? err.message : "Unsupported file");
    }
    const stamp = Date.now().toString(36);
    const out: string[] = new Array(files.length);
    let next = 0;
    let done = 0;
    let failed = 0;
    setBusy(`Uploading 0/${files.length}`);
    const worker = async () => {
      while (next < files.length) {
        const i = next++;
        try {
          out[i] = await uploadHeroAsset(files[i], "hero", `seq-${stamp}-${String(i + 1).padStart(3, "0")}`, adminKey);
        } catch (err) {
          failed++;
          onError(`${files[i].name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
        setBusy(`Uploading ${++done}/${files.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker));
    setBusy(null);
    // A sequence with holes would stutter: keep the old one unless every frame made it.
    if (failed) return onError(`${failed} frame${failed === 1 ? "" : "s"} failed — the sequence wasn't replaced. Try again.`);
    setFrames(() => out.map((url, i) => ({ url, angle: evenAngle(i, out.length) })));
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = "";
    void uploadSequence(list);
  };
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    if (!busy) void uploadSequence([...e.dataTransfer.files]);
  };

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
          <div>
            <span className={`${micro} mb-2 flex items-center justify-between text-white/50`}>
              <span>360° image sequence</span>
              <span className="text-white/35">
                {frames.length ? `${frames.length} frames · ~${(360 / frames.length).toFixed(1)}° apart` : "none — the centre pose shows as a still"}
              </span>
            </span>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-4 py-6 text-center transition-colors ${
                over ? "border-[#e7fe55] bg-[#e7fe55]/10" : "border-white/20 hover:border-white/40"
              } ${busy ? "pointer-events-none opacity-60" : ""}`}
            >
              <span className="text-sm text-white/85">{busy ?? "Upload 360 Image Sequence"}</span>
              <span className={`${micro} text-white/40`}>
                drop or pick every frame at once · sorted by filename (pose-001 … pose-036) · a transparent PNG / WebP lets the orbit pass behind you
              </span>
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onPick} disabled={Boolean(busy)} />
            </label>
            {frames.length > 0 && (
              <>
                <div className="mt-3">
                  <AngleEngine frames={frames} setFrames={setFrames} poses={poses} setPoses={setPoses} adminKey={adminKey} onError={onError} />
                </div>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {[...frames]
                    .sort((a, b) => a.angle - b.angle)
                    .map((f, i) => {
                      const pose = poses[f.url];
                      const info = pose ? `Yaw ${deg(pose.yaw)} · Pitch ${deg(pose.pitch)} · Roll ${deg(pose.roll)}` : pose === null ? "No face detected" : "Not analysed";
                      return (
                        <figure key={f.url} title={`#${i + 1} · placed at ${deg(f.angle)} · ${info}`} className="group relative w-12 shrink-0 border border-white/10 bg-[#111]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails of uploaded URLs on any host */}
                          <img src={f.url} alt={`Frame at ${deg(f.angle)}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                          <figcaption className="absolute bottom-0 left-0 bg-black/70 px-1 font-mono text-[9px] text-white/70">{deg(f.angle)}</figcaption>
                          {pose !== undefined && (
                            <span
                              aria-hidden
                              className={`absolute right-0.5 top-0.5 size-1.5 rounded-full ${pose ? "bg-[#3dffb0]" : "bg-[#4d9fff]"}`}
                            />
                          )}
                          <span className="pointer-events-none absolute inset-0 hidden flex-col justify-center bg-black/80 p-0.5 text-center font-mono text-[8px] leading-tight text-white/85 group-hover:flex">
                            {pose ? (
                              <>
                                <span>Y {deg(pose.yaw)}</span>
                                <span>P {deg(pose.pitch)}</span>
                                <span>R {deg(pose.roll)}</span>
                              </>
                            ) : (
                              <span>{pose === null ? "no face" : "—"}</span>
                            )}
                          </span>
                        </figure>
                      );
                    })}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => setFrames((l) => l.map((f) => ({ ...f, angle: normAngle(-f.angle) })))}
                    title="If the head turns against the mouse"
                  >
                    ⇄ Reverse direction
                  </button>
                  <button type="button" className={btnDanger} onClick={() => setFrames(() => [])}>
                    Remove sequence
                  </button>
                </div>
              </>
            )}
          </div>

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
