"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { btn, btnDanger, btnPrimary, input, micro } from "@/components/admin/ui";
import type { SequenceFrame } from "@/data/hero-config";
import { HERO_SEQUENCE_MAX } from "@/data/hero-defaults";
import { assertSiteImage, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { detectAngle } from "@/lib/ai/angle-detector";
import { matteBlackBackdrop } from "@/lib/backdrop-matte";

/**
 * Import & Map — the recommended way to build the 360° turn: generate each
 * angle outside (Midjourney, Stable Diffusion …) from the centre pose, drop
 * the files here and upload. Each file's yaw is detected in the browser the
 * moment it lands (the same face-pose model as the AI engine — nothing is
 * uploaded to find it); the admin only types an angle when no face is found
 * (the back of the head) or to correct one. A file within ±3° of a frame the
 * sequence already has is flagged and skipped unless "Replace existing" is
 * ticked. The frames go to the media bucket through the same presigned PUT as
 * every hero asset, merge into the sequence and come out sorted -180° → +180°.
 * The hero cross-fades linearly between the two frames around the cursor.
 *
 * The Angle Guide above it lists the angles still missing for an even turn.
 */

const UPLOAD_CONCURRENCY = 4;
/** Two frames this close (degrees) are the same angle: an import there replaces the old one (when allowed). */
const SAME_ANGLE = 3;
const STEPS = [15, 20] as const;
type Step = (typeof STEPS)[number];

type Detect = "detecting" | "face" | "noface";
type Pending = {
  id: string;
  file: File;
  preview: string;
  angle: string;
  detect: Detect;
  /** The admin typed the angle: detection never overwrites it. */
  edited: boolean;
  /** Overwrite the existing frame within ±3° (otherwise this file is skipped). */
  replace: boolean;
};

const fmt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}°`;
/** -180 and +180 are the same view. */
const wrap = (v: number) => (v === 180 ? -180 : v);
/** Shortest distance between two yaws, around the circle. */
const dist = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** The guide's target grid: every `step`° around the circle, -180 … +180 − step. */
function grid(step: Step): number[] {
  const out: number[] = [];
  for (let a = -180; a < 180; a += step) out.push(a);
  return out;
}

/** Strict yaw parse: a finite number in [-180, 180], else null. */
function parseAngle(raw: string): number | null {
  const s = raw.trim().replace(/°$/, "");
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) && v >= -180 && v <= 180 ? Math.round(v * 10) / 10 : null;
}

/** A yaw named in the filename ("yaw-45.png", "angle_+30", "90deg", "-15.png") — the fallback when no face is found. */
function angleFromName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const m =
    base.match(/(?:yaw|angle|deg)[\s_=]*([+-]?\d{1,3}(?:\.\d+)?)(?!\d)/i) ??
    base.match(/(?:^|[^\w])([+-]?\d{1,3}(?:\.\d+)?)\s*(?:deg|°)/i) ??
    base.match(/^([+-]?\d{1,3}(?:\.\d+)?)$/);
  return m && parseAngle(m[1]) !== null ? m[1] : "";
}

/** Black studio backdrop → transparent (the same connectivity matte the hero uses). Other backdrops: the file as it is. */
async function matteFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const out = matteBlackBackdrop(bitmap, bitmap.width, bitmap.height);
    if (!out) return file;
    return await new Promise((resolve) => out.toBlob((b) => resolve(b ?? file), "image/webp", 0.95));
  } finally {
    bitmap.close();
  }
}

/** New frames over old: an existing frame within ±3° of a new one is replaced. Sorted -180 → +180. */
export function mergeFrames(current: SequenceFrame[], incoming: SequenceFrame[]): SequenceFrame[] {
  const kept = current.filter((f) => !incoming.some((n) => dist(n.angle, f.angle) < SAME_ANGLE));
  return [...kept, ...incoming].sort((a, b) => a.angle - b.angle);
}

type Props = {
  frames: SequenceFrame[];
  setFrames: (fn: (l: SequenceFrame[]) => SequenceFrame[]) => void;
  adminKey: string;
  onError: (m: string) => void;
  /** The hero's mouse reach: yaws in [offset − range, offset + range] come first in the guide. */
  reach: { offset: number; range: number };
};

export default function ImportAnglesPanel({ frames, setFrames, adminKey, onError, reach }: Props) {
  const [step, setStep] = useState<Step>(15);
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [matte, setMatte] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const urls = useRef(new Set<string>());
  // Detection runs one image at a time (the pose model is heavy); cards fill in order.
  const detectQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  /* ---------------- Angle Guide ---------------- */
  const guide = useMemo(() => {
    const tol = Math.min(5, step / 3);
    const have = frames.map((f) => f.angle);
    const queued = pending.map((p) => parseAngle(p.angle)).filter((v): v is number => v !== null);
    const lo = reach.offset - reach.range;
    const hi = reach.offset + reach.range;
    const inReach = (a: number) => hi - lo >= 360 || [a - 360, a, a + 360].some((x) => x >= lo && x <= hi);
    const cells = grid(step).map((a) => {
      const state = have.some((h) => dist(h, a) <= tol) ? "have" : queued.some((q) => dist(q, a) <= tol) ? "queued" : "missing";
      return { angle: a, state, reach: inReach(a) } as const;
    });
    const missing = cells
      .filter((c) => c.state === "missing")
      .sort((a, b) => Number(b.reach) - Number(a.reach) || Math.abs(a.angle) - Math.abs(b.angle) || a.angle - b.angle);
    // Widest holes in the frames the hero turns through now.
    const sorted = [...have].sort((a, b) => a - b);
    let widest = 0;
    for (let i = 0; i < sorted.length; i++) {
      const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360;
      if (sorted.length > 1) widest = Math.max(widest, next - sorted[i]);
    }
    return { cells, missing, have: cells.filter((c) => c.state === "have").length, widest };
  }, [frames, pending, step, reach.offset, reach.range]);

  /* ---------------- Import queue ---------------- */
  const add = (list: File[]) => {
    setDone(null);
    const files = list.filter((f) => f.type.startsWith("image/"));
    if (!files.length) return onError("Drop image files (PNG, JPEG or WebP)");
    const ok: Pending[] = [];
    for (const file of files) {
      try {
        assertSiteImage(file);
      } catch (err) {
        onError(`${file.name}: ${err instanceof Error ? err.message : "unsupported file"}`);
        continue;
      }
      const preview = URL.createObjectURL(file);
      urls.current.add(preview);
      ok.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        preview,
        angle: "",
        detect: "detecting",
        edited: false,
        replace: false,
      });
    }
    setPending((p) => [...p, ...ok]);
    for (const item of ok) {
      detectQueue.current = detectQueue.current.then(async () => {
        let yaw: number | null = null;
        try {
          yaw = (await detectAngle(item.file))?.yaw ?? null;
        } catch {
          yaw = null; // the model failed to load: treated like no face — the admin types it
        }
        setPending((all) =>
          all.map((x) => {
            if (x.id !== item.id) return x;
            const angle = x.edited ? x.angle : yaw !== null ? String(wrap(Math.round(yaw))) : angleFromName(x.file.name);
            return { ...x, angle, detect: yaw !== null ? "face" : "noface" };
          }),
        );
      });
    }
  };
  const remove = (id: string) =>
    setPending((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone) {
        URL.revokeObjectURL(gone.preview);
        urls.current.delete(gone.preview);
      }
      return p.filter((x) => x.id !== id);
    });
  const setAngle = (id: string, angle: string) => {
    setPending((p) => p.map((x) => (x.id === id ? { ...x, angle, edited: true } : x)));
    setErrors((e) => {
      if (!e[id]) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  };
  const setReplace = (id: string, replace: boolean) => setPending((p) => p.map((x) => (x.id === id ? { ...x, replace } : x)));
  /** The existing frame this angle would overwrite (within ±3°), if any. */
  const clashWith = (raw: string) => {
    const v = parseAngle(raw);
    return v === null ? null : (frames.find((f) => dist(f.angle, wrap(v)) < SAME_ANGLE) ?? null);
  };
  const detecting = pending.filter((p) => p.detect === "detecting").length;
  const skipped = pending.filter((p) => !p.replace && clashWith(p.angle)).length;
  const clearAll = () => {
    pending.forEach((p) => {
      URL.revokeObjectURL(p.preview);
      urls.current.delete(p.preview);
    });
    setPending([]);
    setErrors({});
  };

  /** Validates the angles, then uploads, merges and sorts. Nothing changes unless every file made it. */
  const confirm = async () => {
    if (detecting) return onError(`Still detecting ${detecting} angle${detecting === 1 ? "" : "s"} — a moment`);
    // Duplicates the admin didn't choose to replace are skipped, not uploaded.
    const queue = pending.filter((p) => p.replace || !clashWith(p.angle));
    if (!queue.length) return onError("Every image matches an existing angle — tick “Replace existing” on the ones to overwrite");
    const errs: Record<string, string> = {};
    const seen = new Map<number, string>();
    for (const p of queue) {
      const v = parseAngle(p.angle);
      if (p.angle.trim() === "") errs[p.id] = "No face found — type this angle";
      else if (v === null) errs[p.id] = "Enter a number from -180 to 180";
      else {
        const key = wrap(v);
        const dup = [...seen.entries()].find(([a]) => dist(a, key) < SAME_ANGLE);
        if (dup) errs[p.id] = `Within ±${SAME_ANGLE}° of ${pending.find((x) => x.id === dup[1])?.file.name ?? "another file"} — remove one`;
        else seen.set(key, p.id);
      }
    }
    setErrors(errs);
    const bad = Object.keys(errs).length;
    if (bad) return onError(`${bad} image${bad === 1 ? " needs" : "s need"} an angle (-180 to 180) — nothing was uploaded`);
    const projected = mergeFrames(
      frames,
      queue.map((p) => ({ url: p.id, angle: parseAngle(p.angle) as number })),
    ).length;
    if (projected > HERO_SEQUENCE_MAX) return onError(`At most ${HERO_SEQUENCE_MAX} frames — this import would make ${projected}`);

    const stamp = Date.now().toString(36);
    const out: (SequenceFrame | null)[] = new Array(queue.length).fill(null);
    let next = 0;
    let count = 0;
    let failed = 0;
    setBusy(`Uploading 0/${queue.length}`);
    const worker = async () => {
      while (next < queue.length) {
        const i = next++;
        const p = queue[i];
        const angle = wrap(parseAngle(p.angle) as number);
        try {
          const blob = matte ? await matteFile(p.file) : p.file;
          const tag = `${angle < 0 ? "m" : "p"}${String(Math.abs(angle)).replace(".", "_")}`;
          const url = await uploadHeroAsset(blob, "hero", `import-${stamp}-${tag}`, adminKey);
          out[i] = { url, angle };
        } catch (err) {
          failed++;
          setErrors((e) => ({ ...e, [p.id]: err instanceof Error ? err.message : "upload failed" }));
          onError(`${p.file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
        }
        setBusy(`Uploading ${++count}/${queue.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker));
    setBusy(null);
    if (failed) return onError(`${failed} upload${failed === 1 ? "" : "s"} failed — the sequence wasn't changed. Fix and press Confirm again.`);
    const incoming = out.filter((f): f is SequenceFrame => f !== null);
    const replaced = incoming.filter((n) => frames.some((f) => dist(f.angle, n.angle) < SAME_ANGLE)).length;
    const skippedNow = pending.length - queue.length;
    setFrames((cur) => mergeFrames(cur, incoming));
    clearAll();
    setDone(
      `${incoming.length} angle${incoming.length === 1 ? "" : "s"} imported${replaced ? ` · ${replaced} replaced` : ""}${
        skippedNow ? ` · ${skippedNow} duplicate${skippedNow === 1 ? "" : "s"} skipped` : ""
      } — save to publish`,
    );
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = "";
    add(list);
  };
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    if (!busy) add([...e.dataTransfer.files]);
  };

  return (
    <div className="border border-[#e7fe55]/25 bg-[#e7fe55]/[0.03] p-4">
      <div className={`${micro} mb-3 flex flex-wrap items-center justify-between gap-2`}>
        <span className="text-[#e7fe55]">Import custom angles · recommended</span>
        <span className="text-white/35">generate outside from your centre pose · angles are detected for you</span>
      </div>

      {/* ---------------- Angle Guide ---------------- */}
      <div className="mb-4 border border-white/10 bg-black/30 p-3">
        <div className={`${micro} mb-2 flex flex-wrap items-center justify-between gap-2 text-white/55`}>
          <span>
            Angle guide · {guide.have}/{guide.cells.length} covered at {step}°
            {guide.widest > 0 && <span className="text-white/35"> · widest gap now {Math.round(guide.widest)}°</span>}
          </span>
          <span className="flex items-center gap-1">
            target step
            {STEPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStep(s)}
                aria-pressed={step === s}
                className={`border px-2 py-0.5 ${step === s ? "border-[#e7fe55] text-[#e7fe55]" : "border-white/15 text-white/50 hover:text-white"}`}
              >
                {s}°
              </button>
            ))}
          </span>
        </div>
        {guide.missing.length ? (
          <p className="mb-3 text-sm text-white/85">
            Recommended angles to generate:{" "}
            <span className="font-mono text-[#e7fe55]">{guide.missing.filter((c) => c.reach).map((c) => fmt(c.angle)).join(", ") || "—"}</span>
            {guide.missing.some((c) => !c.reach) && (
              <span className="block pt-1 text-xs text-white/40">
                Beyond the mouse&apos;s reach (±{reach.range}°{reach.offset ? `, offset ${fmt(reach.offset)}` : ""}), for drag / full turns:{" "}
                <span className="font-mono">{guide.missing.filter((c) => !c.reach).map((c) => fmt(c.angle)).join(", ")}</span>
              </span>
            )}
          </p>
        ) : (
          <p className="mb-3 text-sm text-[#3dffb0]">Every {step}° angle is covered — the turn is complete.</p>
        )}
        <div className="flex flex-wrap gap-1" role="list" aria-label="Angle coverage">
          {guide.cells.map((c) => (
            <span
              key={c.angle}
              role="listitem"
              title={c.state === "have" ? "in the sequence" : c.state === "queued" ? "in the import queue" : c.reach ? "missing — within mouse reach" : "missing — outside mouse reach"}
              className={`min-w-[3.25rem] border px-1.5 py-0.5 text-center font-mono text-[10px] ${
                c.state === "have"
                  ? "border-[#3dffb0]/40 bg-[#3dffb0]/10 text-[#3dffb0] line-through decoration-[#3dffb0]/60"
                  : c.state === "queued"
                    ? "border-[#ffb54d]/50 bg-[#ffb54d]/10 text-[#ffcf8a]"
                    : c.reach
                      ? "border-[#e7fe55]/50 text-[#e7fe55]"
                      : "border-white/10 text-white/35"
              }`}
            >
              {fmt(c.angle)}
            </span>
          ))}
        </div>
        <p className={`${micro} mt-2 text-white/30`}>
          <span className="text-[#3dffb0]">struck = have it</span> · <span className="text-[#ffcf8a]">amber = queued below</span> · <span className="text-[#e7fe55]">lime = generate next</span> · grey = outside mouse reach
        </p>
      </div>

      {/* ---------------- Drop zone ---------------- */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-4 py-5 text-center transition-colors ${
          over ? "border-[#e7fe55] bg-[#e7fe55]/10" : "border-white/20 hover:border-white/40"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <span className="text-sm text-white/85">{busy ?? "Drop custom angle images, or click to pick"}</span>
        <span className={`${micro} text-white/40`}>several at once · each angle is detected automatically in your browser</span>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onPick} disabled={Boolean(busy)} />
      </label>

      {pending.length > 0 && (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {pending.map((p) => {
              const v = parseAngle(p.angle);
              const clash = clashWith(p.angle);
              const skip = Boolean(clash) && !p.replace;
              const needsTyping = p.detect === "noface" && !p.angle;
              const tone = errors[p.id]
                ? "border-[#ff2d2d]/60"
                : clash
                  ? "border-[#ff8a1f] shadow-[0_0_0_1px_rgba(255,138,31,0.35)]"
                  : needsTyping
                    ? "border-[#ffb54d]/50"
                    : "border-white/10";
              return (
                <li key={p.id} className={`border bg-black/30 p-2 transition-colors ${tone}`}>
                  <div className="relative mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob previews */}
                    <img src={p.preview} alt="" className={`aspect-square w-full bg-black object-contain transition-opacity ${skip ? "opacity-40" : ""}`} />
                    {p.detect === "detecting" ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60" role="status">
                        <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-[#e7fe55]" aria-hidden />
                        <span className={`${micro} text-white/80`}>Detecting angle…</span>
                      </div>
                    ) : v !== null ? (
                      <span className={`absolute left-1.5 top-1.5 px-1.5 py-0.5 font-mono text-xs font-bold text-black ${clash ? "bg-[#ff8a1f]" : "bg-[#e7fe55]"}`}>
                        {fmt(wrap(v))}
                      </span>
                    ) : null}
                  </div>
                  <p className="mb-1 truncate font-mono text-[10px] text-white/45" title={p.file.name}>
                    {p.file.name}
                  </p>
                  <p className={`${micro} mb-1 ${needsTyping ? "text-[#ffcf8a]" : "text-white/40"}`}>
                    {p.detect === "detecting"
                      ? "reading the head pose…"
                      : p.edited
                        ? "angle set by hand"
                        : p.detect === "face"
                          ? "✓ detected from the face"
                          : p.angle
                            ? "no face · angle from the filename"
                            : "no face found — type the angle"}
                  </p>
                  <label className={`${micro} flex items-center gap-2 text-white/45`}>
                    <span className="shrink-0">Yaw</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={-180}
                      max={180}
                      step={1}
                      value={p.angle}
                      placeholder={p.detect === "detecting" ? "…" : "-180 … 180"}
                      onChange={(e) => setAngle(p.id, e.target.value)}
                      aria-invalid={Boolean(errors[p.id])}
                      aria-label={`Angle (yaw) for ${p.file.name}`}
                      className={`${input} py-1 font-mono text-xs`}
                      disabled={Boolean(busy)}
                    />
                  </label>
                  {errors[p.id] ? (
                    <p className="mt-1 text-[11px] text-[#ff6b6b]">{errors[p.id]}</p>
                  ) : clash ? (
                    <div className="mt-2 border border-[#ff8a1f]/50 bg-[#ff8a1f]/10 p-1.5">
                      <p className="text-[11px] text-[#ffb46b]">Angle already exists ({fmt(clash.angle)}). Overwrite?</p>
                      <label className={`${micro} mt-1 flex cursor-pointer items-center gap-1.5 text-[#ffb46b]`}>
                        <input type="checkbox" checked={p.replace} onChange={(e) => setReplace(p.id, e.target.checked)} disabled={Boolean(busy)} />
                        Replace existing
                      </label>
                      {skip && <p className={`${micro} mt-1 text-white/35`}>will be skipped</p>}
                    </div>
                  ) : null}
                  <button type="button" className={`${btnDanger} mt-2 w-full`} onClick={() => remove(p.id)} disabled={Boolean(busy)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={btnPrimary} onClick={() => void confirm()} disabled={Boolean(busy) || detecting > 0}>
              {busy ?? (detecting ? `Detecting ${detecting}…` : `Confirm & upload ${pending.length - skipped}`)}
            </button>
            <button type="button" className={btn} onClick={clearAll} disabled={Boolean(busy)}>
              Clear
            </button>
            {skipped > 0 && <span className={`${micro} text-[#ffb46b]`}>{skipped} duplicate{skipped === 1 ? "" : "s"} will be skipped</span>}
            <label className={`${micro} flex items-center gap-2 text-white/55`}>
              <input type="checkbox" checked={matte} onChange={(e) => setMatte(e.target.checked)} disabled={Boolean(busy)} />
              Matte black backdrop on upload
            </label>
          </div>
        </>
      )}
      {done && <p className={`${micro} mt-3 text-[#3dffb0]`}>{done}</p>}
    </div>
  );
}
