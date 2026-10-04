"use client";

import { useState, type ChangeEvent } from "react";
import ReorderList from "@/components/admin/ReorderList";
import { btn, btnDanger, card, Field, input, micro, Section, Segmented, Slider, TabHeader, Toggle } from "@/components/admin/ui";
import type { HeroFeatures, HeroFilter, HeroPose } from "@/data/hero-config";
import { DEFAULT_FEATURES, DEFAULT_POSES } from "@/data/hero-defaults";
import { assertPoseFile, POSE_MAX_EDGE, upscaleImage, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { alignAll, driftPx } from "@/lib/hero-align";
import { useConfigStore } from "../store";

type Slot = number | "up" | "down";
type Audit = { status: "running" } | { status: "done"; offsets: ([number, number] | null)[]; at: number };

const checker =
  "bg-[length:16px_16px] bg-[linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%),linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%)] bg-[position:0_0,8px_8px] bg-[#111]";

/** One "nudge" step: 1px of a 1600px frame, in UV. */
const NUDGE = 1 / 1600;
/** Drift (px @1600) under which a pose counts as aligned. */
const DRIFT_OK = 8;

const FILTERS: { value: HeroFilter; label: string }[] = [
  { value: "none", label: "None" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "vintage", label: "Vintage" },
  { value: "contrast", label: "High contrast" },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

type Props = { adminKey: string; onError: (m: string) => void; onSuccess: (m: string) => void };

export default function HeroTab({ adminKey, onError, onSuccess }: Props) {
  const { hero, setHero } = useConfigStore();
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [dims, setDims] = useState<Record<string, number>>({});
  const [audit, setAudit] = useState<Audit | null>(null);
  if (!hero) return null;

  const all = [...hero.poses.ladder, hero.poses.up, hero.poses.down];
  const slotIndex = (slot: Slot) => (typeof slot === "number" ? slot : slot === "up" ? 7 : 8);
  const getPose = (slot: Slot): HeroPose => (typeof slot === "number" ? hero.poses.ladder[slot] : hero.poses[slot]);
  const setPose = (slot: Slot, patch: Partial<HeroPose>) =>
    setHero((c) => {
      if (typeof slot === "number") {
        return { ...c, poses: { ...c.poses, ladder: c.poses.ladder.map((p, i) => (i === slot ? { ...p, ...patch } : p)) } };
      }
      return { ...c, poses: { ...c.poses, [slot]: { ...c.poses[slot], ...patch } } };
    });
  const setFeature = <K extends keyof HeroFeatures>(k: K, v: HeroFeatures[K]) =>
    setHero((c) => ({ ...c, features: { ...c.features, [k]: v } }));
  const track = (id: string, label: string | null) =>
    setBusy((b) => {
      const next = { ...b };
      if (label === null) delete next[id];
      else next[id] = label;
      return next;
    });

  const replace = async (slot: Slot, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const pose = getPose(slot);
    try {
      assertPoseFile(file);
      track(pose.id, "0%");
      const url = await uploadHeroAsset(file, "hero", pose.id, adminKey, (p) => track(pose.id, `${p}%`));
      setPose(slot, { src: url });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      track(pose.id, null);
    }
  };

  const upscale = async (slot: Slot) => {
    const pose = getPose(slot);
    try {
      track(pose.id, "Upscaling…");
      const { blob } = await upscaleImage(pose.src, POSE_MAX_EDGE);
      track(pose.id, "0%");
      const url = await uploadHeroAsset(blob, "hero", `${pose.id}-upscaled`, adminKey, (p) => track(pose.id, `${p}%`));
      setPose(slot, { src: url });
      onSuccess(`${pose.label} upscaled to ${POSE_MAX_EDGE}px — save to publish`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upscale failed");
    } finally {
      track(pose.id, null);
    }
  };

  const runAudit = async () => {
    setAudit({ status: "running" });
    try {
      const images = await Promise.all(all.map((p) => loadImage(p.src).catch(() => null)));
      const readable = images.map((img) => img ?? document.createElement("canvas"));
      const offsets = alignAll(readable, 3).map((o, i) => (images[i] ? o : null));
      setAudit({ status: "done", offsets, at: Date.now() });
    } catch (err) {
      setAudit(null);
      onError(err instanceof Error ? err.message : "Audit failed");
    }
  };

  /** Write the measured offsets into each pose (and stop auto-aligning — they're now explicit). */
  const bake = () => {
    if (audit?.status !== "done") return;
    const o = audit.offsets;
    const round = (v: number) => Math.round(v * 10000) / 10000;
    const withOffset = (p: HeroPose, i: number): HeroPose => {
      const off = o[i];
      return off ? { ...p, offset: [round(off[0]), round(off[1])] } : p;
    };
    setHero((c) => ({
      ...c,
      poses: { ladder: c.poses.ladder.map(withOffset), up: withOffset(c.poses.up, 7), down: withOffset(c.poses.down, 8) },
      features: { ...c.features, autoAlign: false },
    }));
    onSuccess("Offsets baked into the poses (auto-align off) — save to publish");
  };

  const poseCard = (slot: Slot, move?: (d: number) => void) => {
    const pose = getPose(slot);
    const i = slotIndex(slot);
    const w = dims[pose.src];
    const low = w !== undefined && w < 1000;
    const activity = busy[pose.id];
    const def = DEFAULT_POSES[pose.id];
    const isDefault = def && def.src === pose.src && def.tint === pose.tint && !pose.offset;
    const off = pose.offset ?? [0, 0];
    const drift = audit?.status === "done" ? audit.offsets[i] : undefined;
    const nudge = (dx: number, dy: number) => {
      const next: [number, number] = [Math.round((off[0] + dx) * 1e5) / 1e5, Math.round((off[1] + dy) * 1e5) / 1e5];
      setPose(slot, { offset: next[0] === 0 && next[1] === 0 ? undefined : next });
    };
    return (
      <div className={`${card} flex h-full flex-col`}>
        <div className={`relative aspect-square ${checker}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of an arbitrary blob/local URL */}
          <img
            src={pose.src}
            alt={pose.label}
            draggable={false}
            onLoad={(e) => {
              const nw = e.currentTarget.naturalWidth;
              setDims((d) => (d[pose.src] === nw ? d : { ...d, [pose.src]: nw }));
            }}
            className="absolute inset-0 size-full object-contain"
            style={{ transform: `translate(${off[0] * 100}%, ${-off[1] * 100}%)` }}
          />
          {slot === 3 && (
            <span className="absolute left-1.5 top-1.5 bg-[#e7fe55] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-black">
              Rest
            </span>
          )}
          {w !== undefined && (
            <span
              className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${low ? "bg-[#ff2d2d] text-white" : "bg-black/70 text-white/70"}`}
              title={low ? "Under 1000px — upscale or replace" : undefined}
            >
              {w}px
            </span>
          )}
          {drift !== undefined && (
            <span
              className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${
                drift === null ? "bg-white/20 text-white" : driftPx(drift) < DRIFT_OK ? "bg-[#3dffb0] text-black" : "bg-[#ffb54d] text-black"
              }`}
              title={drift === null ? "Couldn't read this image (CORS)" : "Shoulder drift vs. the rest pose (px of a 1600px frame)"}
            >
              {drift === null ? "?" : `Δ ${driftPx(drift)}px`}
            </span>
          )}
          {activity && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-[10px] uppercase tracking-widest text-[#e7fe55]">
              {activity}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-bold uppercase tracking-wide">{pose.label}</span>
            <input
              type="color"
              value={pose.tint}
              onChange={(e) => setPose(slot, { tint: e.target.value })}
              aria-label={`${pose.label} rim tint`}
              title="Reactive-lighting tint"
              className="h-5 w-7 shrink-0 cursor-pointer border border-white/15 bg-transparent"
            />
          </div>
          <div className="flex items-center gap-1 font-mono text-[9px] text-white/40" title="Manual nudge (1px of a 1600px frame per click)">
            <span className="mr-auto tabular-nums">
              {Math.round(off[0] * 1600)},{Math.round(off[1] * 1600)}px
            </span>
            {(
              [
                ["←", -NUDGE, 0],
                ["→", NUDGE, 0],
                ["↑", 0, NUDGE],
                ["↓", 0, -NUDGE],
              ] as const
            ).map(([l, dx, dy]) => (
              <button key={l} type="button" aria-label={`Nudge ${pose.label} ${l}`} onClick={() => nudge(dx, dy)} className="px-1 hover:text-[#e7fe55]">
                {l}
              </button>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap gap-1">
            <label className={`${btn} cursor-pointer px-2`}>
              Replace
              <input type="file" accept="image/png,image/webp" className="sr-only" onChange={(e) => void replace(slot, e)} />
            </label>
            <button
              type="button"
              className={`${btn} px-2`}
              disabled={Boolean(activity) || w === undefined || w >= POSE_MAX_EDGE}
              onClick={() => void upscale(slot)}
              title={w !== undefined && w >= POSE_MAX_EDGE ? "Already full resolution" : `Upscale to ${POSE_MAX_EDGE}px`}
            >
              Upscale
            </button>
            <button
              type="button"
              className={`${btn} px-2`}
              disabled={!def || isDefault}
              onClick={() => def && setPose(slot, { src: def.src, tint: def.tint, offset: undefined })}
              title={def ? "Back to the factory image, tint and offset" : "No factory default for this pose id"}
            >
              Reset
            </button>
            {move && (
              <span className="ml-auto flex gap-1">
                <button type="button" className={`${btn} px-1.5`} aria-label={`Move ${pose.label} left`} onClick={() => move(-1)} disabled={slot === 0}>
                  ←
                </button>
                <button type="button" className={`${btn} px-1.5`} aria-label={`Move ${pose.label} right`} onClick={() => move(1)} disabled={slot === 6}>
                  →
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const f = hero.features;
  const drifting = audit?.status === "done" ? audit.offsets.filter((o) => o && driftPx(o) >= DRIFT_OK).length : 0;

  return (
    <div>
      <TabHeader
        title="Poses"
        hint="9-pose head · dithered crossfade · the Cinematic hero's own effects · every hero variant uses these poses · edits preview live in the dock"
        actions={
          <button
            type="button"
            className={btn}
            onClick={() => setHero((c) => ({ ...c, features: { ...DEFAULT_FEATURES, ambientSound: c.features.ambientSound } }))}
          >
            Reset effects
          </button>
        }
      />

      <Section
        title="Head poses"
        hint="drag (or Alt ←/→) to reorder · left → right follows the pointer · the middle pose is the rest pose"
        aside={
          <span className="flex items-center gap-2">
            {audit?.status === "done" && (
              <span className={`${micro} ${drifting ? "text-[#ffb54d]" : "text-[#3dffb0]"}`}>
                {drifting ? `${drifting} pose${drifting === 1 ? "" : "s"} drift ≥ ${DRIFT_OK}px${f.autoAlign ? " — auto-align corrects them" : ""}` : "All aligned"}
              </span>
            )}
            <button type="button" className={btn} onClick={() => void runAudit()} disabled={audit?.status === "running"}>
              {audit?.status === "running" ? "Auditing…" : "Audit framing"}
            </button>
            {audit?.status === "done" && (
              <button type="button" className={btn} onClick={bake} title="Write the measured offsets into each pose">
                Bake offsets
              </button>
            )}
          </span>
        }
      >
        <ReorderList
          label="Pose ladder"
          direction="row"
          items={hero.poses.ladder}
          getId={(p) => p.id}
          onChange={(ladder) => setHero((c) => ({ ...c, poses: { ...c.poses, ladder } }))}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-7"
          itemClassName="cursor-grab active:cursor-grabbing"
          render={(_, i, move) => poseCard(i, move)}
        />
        <p className={`${micro} mb-2 mt-5 text-white/40`}>Vertical — swaps in near the centre column when the pointer is high / low; the head tilts ±0.12 rad</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-7">
          {poseCard("up")}
          {poseCard("down")}
        </div>
      </Section>

      <Section title="Crossfade & framing">
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label="Auto-align poses" hint="snap each pose's shoulders onto the rest pose's" checked={f.autoAlign} onChange={(v) => setFeature("autoAlign", v)} />
          <div className={`${card} px-3 py-2.5 text-sm text-white/60`}>
            Poses never blend: each pixel shows one pose, chosen by an 8×8 ordered dither that shifts every frame — a clean
            pose at rest, a fine dissolve in motion, plus an 80ms smear on every change.
          </div>
        </div>
      </Section>

      <Section title="Effects" hint="the scene only runs on desktop with motion allowed — phones and reduced motion get the still">
        <div className="mb-3">
          <p className={`${micro} mb-2 text-white/50`}>Filter</p>
          <Segmented label="Filter" value={f.filter} options={FILTERS} onChange={(v) => setFeature("filter", v)} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Toggle label="Floating particles" hint="embers rising around the silhouette" checked={f.particles} onChange={(v) => setFeature("particles", v)} />
          <Slider label="Particle intensity" hint="count + glow (200 max)" value={f.particleIntensity} disabled={!f.particles} onChange={(v) => setFeature("particleIntensity", v)} />
          <Toggle label="Chromatic fog" hint="coloured veil, drifts with the pointer" checked={f.fog} onChange={(v) => setFeature("fog", v)} />
          <Toggle label="Light rays" hint="volumetric god-rays from the sun" checked={f.lightRays} onChange={(v) => setFeature("lightRays", v)} />
          <Slider label="Ray intensity" value={f.rayIntensity} disabled={!f.lightRays} onChange={(v) => setFeature("rayIntensity", v)} />
          <Toggle label="Depth of field" hint="background softens when the pointer rests centre" checked={f.depthOfField} onChange={(v) => setFeature("depthOfField", v)} />
          <Toggle label="Hue shift on scroll" hint="the scene's hue drifts as the hero leaves" checked={f.hueShift} onChange={(v) => setFeature("hueShift", v)} />
          <Toggle label="Cursor ripple" hint="after 3s without movement" checked={f.cursorRipple} onChange={(v) => setFeature("cursorRipple", v)} />
          <Toggle label="Reactive lighting" hint="rim + bloom follow the pose tint" checked={f.reactiveLighting} onChange={(v) => setFeature("reactiveLighting", v)} />
          <Toggle label="Cinematic bars" hint="6vh letterbox · slides out on scroll" checked={f.cinematicBars} onChange={(v) => setFeature("cinematicBars", v)} />
          <Toggle label="Camera shake" hint="on fast pointer flicks" checked={f.cameraShake} onChange={(v) => setFeature("cameraShake", v)} />
          <Toggle label="Glitch" hint="a 2–3px jolt every 8–12s" checked={f.glitch} onChange={(v) => setFeature("glitch", v)} />
          <Slider label="Parallax depth" hint="stars · sun · grid drift" value={f.parallax} onChange={(v) => setFeature("parallax", v)} />
          <Slider label="Chromatic aberration" hint="0 off · 0.5 original" value={f.chromaticAberration} onChange={(v) => setFeature("chromaticAberration", v)} />
          <Slider label="Bloom intensity" hint="0.5 original" value={f.bloom} onChange={(v) => setFeature("bloom", v)} />
        </div>
      </Section>

      <Section title="Ambient sound" hint="off by default · starts after the visitor interacts · mute lives in the nav">
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle label="Ambient sound" checked={f.ambientSound} onChange={(v) => setFeature("ambientSound", v)} />
          <Field label="Audio file" hint="empty = synthesised drone · /audio/hero-ambient.mp3 is a silent placeholder until replaced">
            <input
              value={hero.ambientSrc}
              placeholder="(synthesised)"
              onChange={(e) => setHero((c) => ({ ...c, ambientSrc: e.target.value.trim() }))}
              className={input}
            />
          </Field>
        </div>
      </Section>

      <Section title="Danger zone">
        <button
          type="button"
          className={btnDanger}
          onClick={() => {
            if (window.confirm("Reset every pose to its factory image, tint and offset? (Unsaved until you save.)")) {
              setHero((c) => ({
                ...c,
                poses: {
                  ladder: c.poses.ladder.map((p) => DEFAULT_POSES[p.id] ?? p),
                  up: DEFAULT_POSES[c.poses.up.id] ?? c.poses.up,
                  down: DEFAULT_POSES[c.poses.down.id] ?? c.poses.down,
                },
              }));
            }
          }}
        >
          Reset all poses
        </button>
      </Section>
    </div>
  );
}
