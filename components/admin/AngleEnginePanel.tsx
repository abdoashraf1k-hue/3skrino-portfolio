"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { btn, btnDanger, micro } from "@/components/admin/ui";
import type { SequenceFrame } from "@/data/hero-config";
import { HERO_SEQUENCE_MAX } from "@/data/hero-defaults";
import { assertSiteImage, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { normAngle } from "@/lib/ai/angle-detector";
import { sameOriginMedia } from "@/lib/media-url";
import AngleEngine, { type PoseMap } from "./AngleEngine";

/** Parallel uploads for a sequence (each frame is one presigned PUT). */
const UPLOAD_CONCURRENCY = 4;

/** Rotation order: natural filename order, so pose-2 comes before pose-10 and 001 … 036 stay in line. */
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Frame i of n spread evenly over the turn, the first facing the camera. */
const evenAngle = (i: number, n: number) => Math.round(normAngle((i * 360) / n) * 10) / 10;
const deg = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}°`;

type Props = {
  frames: SequenceFrame[];
  setFrames: (fn: (l: SequenceFrame[]) => SequenceFrame[]) => void;
  adminKey: string;
  onError: (m: string) => void;
};

/**
 * Sprint 15.5 — the 360° sequence + AI Reality Engine as one shared panel:
 * upload a turn, analyse every frame's head pose, generate the missing 5°
 * steps with the free AI engine, check / reverse / clear the frames. It
 * edits whatever sequence it is given; the admin renders it in Poses →
 * Genesis (the primary hero), and the 3D-model hero reads the same frames.
 * Detected poses are session-only, as before.
 */
export default function AngleEnginePanel({ frames, setFrames, adminKey, onError }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [poses, setPoses] = useState<PoseMap>({});

  /** Uploads a whole sequence (sorted by filename, angles spread evenly from 0°); it replaces the current one only once every frame is in. */
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
    <div>
      <span className={`${micro} mb-2 flex items-center justify-between text-white/50`}>
        <span>360° image sequence · AI Reality Engine</span>
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
          drop or pick every frame at once · sorted by filename (pose-001 … pose-072) · 24–72 frames turn smoothly
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
                    <img src={sameOriginMedia(f.url)} alt={`Frame at ${deg(f.angle)}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                    <figcaption className="absolute bottom-0 left-0 bg-black/70 px-1 font-mono text-[9px] text-white/70">{deg(f.angle)}</figcaption>
                    {pose !== undefined && <span aria-hidden className={`absolute right-0.5 top-0.5 size-1.5 rounded-full ${pose ? "bg-[#3dffb0]" : "bg-[#4d9fff]"}`} />}
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
            <button type="button" className={btn} onClick={() => setFrames((l) => l.map((f) => ({ ...f, angle: normAngle(-f.angle) })))} title="If the head turns against the mouse">
              ⇄ Reverse direction
            </button>
            <button type="button" className={btnDanger} onClick={() => setFrames(() => [])}>
              Remove sequence
            </button>
          </div>
        </>
      )}
    </div>
  );
}
