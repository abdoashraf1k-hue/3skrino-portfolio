"use client";

import { useRef, useState } from "react";
import { btn, btnDanger, btnPrimary, micro, Segmented } from "@/components/admin/ui";
import type { SequenceFrame } from "@/data/hero-config";
import { HERO_SEQUENCE_MAX } from "@/data/hero-defaults";
import { uploadHeroAsset } from "@/lib/admin/hero-assets";
import {
  analyzeCoverage,
  angleDelta,
  detectAngle,
  fitSequenceAngles,
  formatRanges,
  GRID_STEP,
  gridAngle,
  reachableAngles,
  type HeadPose,
} from "@/lib/ai/angle-detector";

/** Detection per frame URL: a pose, null (no face — profile / back of the head), or not analysed yet (absent). */
export type PoseMap = Record<string, HeadPose | null>;

/** The model's limit per pass (route.ts MAX_ROTATE): each hop reaches this much further from a real face. */
const HOP = 20;
const JOB_CONCURRENCY = 3;
const POLL_MS = 2500;
const POLL_TIMEOUT_MS = 4 * 60_000;
/** Most frames one Generate run may create (each is a paid Replicate prediction). */
const MAX_PER_RUN = 24;

const sortByAngle = (l: SequenceFrame[]) => [...l].sort((a, b) => a.angle - b.angle);
const deg = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}°`;

async function aiFetch<T>(key: string, init: { method: "GET" | "POST"; query?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/ai/generate-angles${init.query ? `?${init.query}` : ""}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${key}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return (init.query?.includes("file=") ? res.blob() : res.json()) as Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Dial                                                                */
/* ------------------------------------------------------------------ */

type Cell = "face" | "inferred" | "reachable" | "missing";
const CELL_FILL: Record<Cell, string> = { face: "#3dffb0", inferred: "#4d9fff", reachable: "#ffb54d", missing: "#2a2a2a" };

/** 36 wedges, 0° (facing the camera) at the top, positive yaw clockwise; the coverage % in the middle. */
function CoverageDial({ cells, pct }: { cells: Map<number, Cell>; pct: number }) {
  const R1 = 44;
  const R2 = 70;
  const pt = (a: number, r: number) => {
    const t = ((a - 90) * Math.PI) / 180;
    return `${(80 + r * Math.cos(t)).toFixed(2)} ${(80 + r * Math.sin(t)).toFixed(2)}`;
  };
  return (
    <svg viewBox="0 0 160 160" className="size-40 shrink-0" role="img" aria-label={`${pct}% of the 360° turn covered`}>
      {[...cells].map(([a, cell]) => {
        const a0 = a - GRID_STEP / 2 + 0.8;
        const a1 = a + GRID_STEP / 2 - 0.8;
        return (
          <path key={a} d={`M ${pt(a0, R1)} L ${pt(a0, R2)} A ${R2} ${R2} 0 0 1 ${pt(a1, R2)} L ${pt(a1, R1)} A ${R1} ${R1} 0 0 0 ${pt(a0, R1)} Z`} fill={CELL_FILL[cell]}>
            <title>{`${deg(a)} — ${cell === "face" ? "face detected" : cell === "inferred" ? "frame, angle from its place in the turn" : cell === "reachable" ? "missing — AI can generate it" : "missing — needs a real photo"}`}</title>
          </path>
        );
      })}
      <text x="80" y="78" textAnchor="middle" className="fill-white font-mono text-[22px]">
        {pct}%
      </text>
      <text x="80" y="96" textAnchor="middle" className="fill-white/40 font-mono text-[8px] uppercase tracking-widest">
        coverage
      </text>
      <text x="80" y="8" textAnchor="middle" className="fill-white/40 font-mono text-[7px]">
        0° FRONT
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

type Props = {
  frames: SequenceFrame[];
  setFrames: (fn: (l: SequenceFrame[]) => SequenceFrame[]) => void;
  poses: PoseMap;
  setPoses: (fn: (p: PoseMap) => PoseMap) => void;
  adminKey: string;
  onError: (m: string) => void;
};

/**
 * Poses → AI Reality Engine (Sprint 14). "Analyze" reads every frame's head
 * pose in the browser and maps it onto the 36-step grid; "Generate" asks
 * Replicate to turn the nearest real face into each missing angle it can
 * reach (±20° per hop), re-measures what came back, and adds only frames
 * that land on a still-empty step — so the sequence never gains duplicates.
 */
export default function AngleEngine({ frames, setFrames, poses, setPoses, adminKey, onError }: Props) {
  const [running, setRunning] = useState<"analyze" | "generate" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [hops, setHops] = useState<"1" | "2" | "3">("2");
  const stop = useRef(false);
  const say = (line: string) => setLog((l) => [...l.slice(-199), `${new Date().toLocaleTimeString()}  ${line}`]);

  const analysed = frames.filter((f) => f.url in poses);
  const effective = (f: SequenceFrame) => poses[f.url]?.yaw ?? f.angle;
  const cov = analyzeCoverage(frames.map(effective));
  const faceYaws = frames.flatMap((f) => (poses[f.url] ? [poses[f.url]!.yaw] : []));
  const reach = HOP * Number(hops);
  const reachable = new Set(reachableAngles(cov.missingAngles, faceYaws.map((y) => gridAngle(y)), reach));
  const faceGrid = new Set(faceYaws.map((y) => gridAngle(y)));
  const cells = new Map<number, Cell>(
    [...cov.detectedAngles.map((a) => [a, faceGrid.has(a) ? "face" : "inferred"] as const), ...cov.missingAngles.map((a) => [a, reachable.has(a) ? "reachable" : "missing"] as const)].sort(
      (a, b) => a[0] - b[0],
    ),
  );
  const pitches = frames.flatMap((f) => (poses[f.url] ? [poses[f.url]!.pitch] : []));

  /* -------------------------------- Analyze -------------------------------- */

  const analyze = async () => {
    if (!frames.length) return onError("Upload a sequence first");
    stop.current = false;
    setRunning("analyze");
    setProgress({ done: 0, total: frames.length });
    say(`Analyzing ${frames.length} frames — loading the face model on first run…`);
    const next: PoseMap = {};
    let faces = 0;
    for (const [i, f] of frames.entries()) {
      if (stop.current) break;
      try {
        const pose = await detectAngle(f.url);
        next[f.url] = pose;
        if (pose) faces++;
        say(`#${i + 1}  ${pose ? `yaw ${deg(pose.yaw)} · pitch ${deg(pose.pitch)} · roll ${deg(pose.roll)}` : "no face (profile or back of the head)"}`);
      } catch (err) {
        say(`#${i + 1}  couldn't analyse: ${err instanceof Error ? err.message : "error"}`);
      }
      setProgress({ done: i + 1, total: frames.length });
    }
    setPoses((p) => ({ ...p, ...next }));
    const after = analyzeCoverage(frames.map((f) => (next[f.url] ?? poses[f.url])?.yaw ?? f.angle));
    say(`Done: ${faces} face${faces === 1 ? "" : "s"} · ${after.coveragePercentage}% coverage${after.missingAngles.length ? ` · missing ${formatRanges(after.missingAngles)} yaw` : ""}`);
    setRunning(null);
    setProgress(null);
  };

  const applyAngles = () => {
    setFrames((l) => sortByAngle(fitSequenceAngles(l, l.map((f) => poses[f.url] ?? null))));
    say("Frame angles set from the detected head poses (frames without a face follow the turn around them)");
  };

  /* -------------------------------- Generate ------------------------------- */

  /** Runs one prediction to the end and returns the image. */
  const runJob = async (id: string): Promise<Blob> => {
    const until = Date.now() + POLL_TIMEOUT_MS;
    for (;;) {
      if (stop.current) throw new Error("stopped");
      const s = await aiFetch<{ status: string; error: string | null; outputs: number }>(adminKey, { method: "GET", query: `id=${id}` });
      if (s.status === "succeeded") {
        if (!s.outputs) throw new Error("the model returned no image");
        return aiFetch<Blob>(adminKey, { method: "GET", query: `id=${id}&file=0` });
      }
      if (s.status === "failed" || s.status === "canceled") throw new Error(s.error ?? s.status);
      if (Date.now() > until) throw new Error("timed out");
      await sleep(POLL_MS);
    }
  };

  const generate = async () => {
    const sources0 = frames.filter((f) => poses[f.url]);
    if (!sources0.length) return onError("Analyze first — generation starts from frames where a face was detected");
    const plan = reachableAngles(cov.missingAngles, faceYaws.map((y) => gridAngle(y)), reach);
    if (!plan.length) return onError(cov.missingAngles.length ? "Every missing angle is out of the model's reach — those need real photos" : "Nothing is missing");
    const room = HERO_SEQUENCE_MAX - frames.length;
    const budget = Math.min(MAX_PER_RUN, plan.length, room);
    if (budget <= 0) return onError(`The sequence is full (${HERO_SEQUENCE_MAX} frames)`);
    if (!window.confirm(`Generate up to ${budget} frame${budget === 1 ? "" : "s"} on Replicate (paid per image)?\n\nTargets: ${formatRanges(plan.slice(0, budget))} yaw`)) return;

    stop.current = false;
    setRunning("generate");
    setProgress({ done: 0, total: budget });
    // Sources grow as frames land (the next hop builds on them); covered steps fill so nothing is generated twice.
    const sources: { url: string; yaw: number; pitch: number }[] = sources0.map((f) => ({ url: f.url, yaw: poses[f.url]!.yaw, pitch: poses[f.url]!.pitch }));
    const covered = new Set(cov.detectedAngles);
    // Measured model units per degree of detected turn (sign included): calibrates the next requests.
    const gains: number[] = [];
    const gain = () => (gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : 1);
    let made = 0;
    let tried = 0;

    for (let hop = 1; hop <= Number(hops) && made < budget && !stop.current; hop++) {
      const wave = reachableAngles(
        [...cells.keys()].filter((a) => !covered.has(a)),
        sources.map((s) => gridAngle(s.yaw)),
        HOP,
      ).slice(0, budget - made);
      if (!wave.length) break;
      say(`Hop ${hop}: ${wave.length} angle${wave.length === 1 ? "" : "s"} — ${formatRanges(wave)}`);

      let next = 0;
      const worker = async () => {
        while (next < wave.length && !stop.current && made < budget) {
          const target = wave[next++];
          if (covered.has(target)) continue;
          const src = sources.reduce((a, b) => (Math.abs(angleDelta(b.yaw, target)) < Math.abs(angleDelta(a.yaw, target)) ? b : a));
          tried++;
          try {
            const g = gain();
            const { jobs } = await aiFetch<{ jobs: { angle: number; rotateYaw: number; id: string }[] }>(adminKey, {
              method: "POST",
              body: { referenceImageUrl: src.url, referenceYaw: src.yaw, missingAngles: [target], gain: g },
            });
            const job = jobs[0];
            say(`${deg(target)}: from the ${deg(src.yaw)} frame, rotate ${deg(job.rotateYaw)} (job ${job.id.slice(0, 8)})`);
            const blob = await runJob(job.id);
            const pose = await detectAngle(blob);
            if (!pose) {
              say(`${deg(target)}: no face in the result — discarded`);
              continue;
            }
            const turned = angleDelta(src.yaw, pose.yaw);
            if (Math.abs(job.rotateYaw) >= 5 && Math.abs(turned) >= 1) gains.push(job.rotateYaw / turned);
            const landed = gridAngle(pose.yaw);
            if (covered.has(landed)) {
              say(`${deg(target)}: landed at ${deg(pose.yaw)}, a step that's already covered — discarded`);
              continue;
            }
            covered.add(landed);
            const name = `seq-ai-${String(Math.round(pose.yaw + 180)).padStart(3, "0")}-${Date.now().toString(36)}`;
            const url = await uploadHeroAsset(blob, "hero", name, adminKey);
            setPoses((p) => ({ ...p, [url]: pose }));
            setFrames((l) => sortByAngle([...l, { url, angle: pose.yaw }]));
            sources.push({ url, yaw: pose.yaw, pitch: pose.pitch });
            made++;
            setProgress({ done: made, total: budget });
            say(`${deg(target)}: ✓ added at ${deg(pose.yaw)}`);
          } catch (err) {
            const m = err instanceof Error ? err.message : "failed";
            say(`${deg(target)}: ${m}`);
            if (/REPLICATE_API_TOKEN|Unauthorized|401/.test(m)) {
              onError(m);
              stop.current = true;
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(JOB_CONCURRENCY, wave.length) }, worker));
    }

    say(`Generated ${made} of ${tried} tried${gains.length ? ` · model gain ${gain().toFixed(2)} units/°` : ""}${stop.current ? " · stopped" : ""} — save to publish`);
    setRunning(null);
    setProgress(null);
  };

  /* --------------------------------- View ---------------------------------- */

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const outOfReach = cov.missingAngles.filter((a) => !reachable.has(a));

  return (
    <div className="mb-3 border border-white/10 bg-white/[0.02] p-4">
      <div className={`${micro} mb-3 flex flex-wrap items-center justify-between gap-2 text-white/50`}>
        <span>AI Reality Engine</span>
        <span className="text-white/35">
          {analysed.length}/{frames.length} analysed
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <CoverageDial cells={cells} pct={cov.coveragePercentage} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-sm text-white/85">
            You have {cov.coveragePercentage}% coverage.
            {cov.missingAngles.length ? ` Missing: ${formatRanges(cov.missingAngles)} yaw.` : " Every 10° step has a frame."}
            {pitches.length > 1 && ` Pitch in your faces: ${deg(Math.min(...pitches))} to ${deg(Math.max(...pitches))}.`}
          </p>
          {cov.missingAngles.length > 0 && (
            <p className={`${micro} leading-relaxed text-white/45`}>
              Need: {cov.missingAngles.map(deg).join(", ")}
              {analysed.length > 0 && outOfReach.length > 0 && <span className="text-[#ff8a8a]"> · out of the AI&apos;s reach (real photos): {formatRanges(outOfReach)}</span>}
            </p>
          )}
          <div className={`${micro} flex flex-wrap gap-3 text-white/40`}>
            {(Object.keys(CELL_FILL) as Cell[]).map((c) => (
              <span key={c} className="flex items-center gap-1.5">
                <span className="size-2" style={{ background: CELL_FILL[c] }} />
                {c === "face" ? "face" : c === "inferred" ? "no face · by order" : c === "reachable" ? "AI can fill" : "needs a photo"}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnPrimary} disabled={Boolean(running) || !frames.length} onClick={() => void analyze()}>
              {running === "analyze" ? "Analyzing…" : "Analyze All Images"}
            </button>
            <button type="button" className={btnPrimary} disabled={Boolean(running) || !analysed.length} onClick={() => void generate()}>
              {running === "generate" ? "Generating…" : "Generate Missing Angles"}
            </button>
            {running ? (
              <button type="button" className={btnDanger} onClick={() => (stop.current = true)}>
                Stop
              </button>
            ) : (
              analysed.length > 0 && (
                <button type="button" className={btn} onClick={applyAngles} title="Write the detected yaw into each frame (save to publish)">
                  Use detected angles
                </button>
              )
            )}
            <span className={`${micro} ml-auto flex items-center gap-2 text-white/40`}>
              AI reach
              <Segmented
                label="Hops from a real face"
                value={hops}
                options={[
                  { value: "1", label: "±20°" },
                  { value: "2", label: "±40°" },
                  { value: "3", label: "±60°" },
                ]}
                onChange={setHops}
              />
            </span>
          </div>

          {progress && (
            <div className="flex items-center gap-3" role="status">
              <span className="h-1 flex-1 overflow-hidden bg-white/10">
                <span className="block h-full bg-[#e7fe55] transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </span>
              <span className={`${micro} text-white/50`}>
                {progress.done}/{progress.total}
              </span>
            </div>
          )}
        </div>
      </div>

      {log.length > 0 && (
        <pre aria-live="polite" className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap border border-white/10 bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-white/60">
          {log.slice().reverse().join("\n")}
        </pre>
      )}
    </div>
  );
}
