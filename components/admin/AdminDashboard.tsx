"use client";

import type { ReactNode } from "react";
import { projectCredits, type Project } from "@/data/projects";
import type { StatsResponse } from "@/app/api/admin/stats/route";

type Props = {
  projects: Project[];
  stats: StatsResponse | null;
  syncedAt: number | null;
  now: number;
};

const WEEK_MS = 7 * 86_400_000;

export function timeAgo(from: number, now: number): string {
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Hand-drawn SVG sparkline — no chart library. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label} className="overflow-visible">
      <path d={area} fill="#e7fe55" fillOpacity="0.08" />
      <path d={line} fill="none" stroke="#e7fe55" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill="#e7fe55" />}
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-white/10 px-4 py-3 [&:not(:first-child)]:border-l">
      <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">{label}</span>
      <span className="truncate text-xl font-black tabular-nums tracking-tight">{value}</span>
      {sub && <span className="truncate font-mono text-[9px] uppercase tracking-widest text-white/35">{sub}</span>}
    </div>
  );
}

/** Stats bar + live storage panel. Parent refreshes `stats` every 30s. */
export default function AdminDashboard({ projects, stats, syncedAt, now }: Props) {
  const credits = projects.map(projectCredits);
  const featured = projects.filter((p) => p.featured).length;
  const vertical = projects.filter((p) => p.orientation === "vertical").length;
  const recent = projects.filter((p) => p.createdAt && now - Date.parse(p.createdAt) < WEEK_MS).length;
  const blob = stats?.blob;
  const lastEdit = stats?.lastEdit ? Date.parse(stats.lastEdit) : null;

  return (
    <div className="mb-6 grid grid-cols-2 border border-white/10 bg-[#0d0d0d] sm:grid-cols-3 lg:grid-cols-7">
      <Stat label="Projects" value={projects.length} sub={`+${recent} in 7 days`} />
      <Stat label="Featured" value={featured} sub="on home" />
      <Stat label="9:16 / 16:9" value={`${vertical} / ${projects.length - vertical}`} sub="orientation" />
      <Stat
        label="Credits"
        value={
          <span className="text-base">
            🎬 {credits.filter((c) => c.filmed).length} · 🎥 {credits.filter((c) => c.directed).length} · ✂️{" "}
            {credits.filter((c) => c.edited).length}
          </span>
        }
        sub="filmed · directed · edited"
      />
      <Stat
        label="Last edit"
        value={lastEdit ? timeAgo(lastEdit, now) : "—"}
        sub={syncedAt ? `synced ${timeAgo(syncedAt, now)}` : "connecting…"}
      />
      <Stat
        label="Blob storage"
        value={blob?.configured ? bytes(blob.bytes) : "—"}
        sub={blob?.configured ? `${blob.videos} videos · ${bytes(blob.videoBytes)}` : "not configured"}
      />
      <div className="col-span-2 flex flex-col justify-between gap-1 border-white/10 px-4 py-3 sm:col-span-3 lg:col-span-1 lg:border-l">
        <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">Uploads · 14 days</span>
        <Sparkline values={blob?.uploadsByDay ?? Array(14).fill(0)} label="Uploads per day over the last 14 days" />
        <span className="font-mono text-[9px] uppercase tracking-widest text-white/35">
          {(blob?.uploadsByDay ?? []).reduce((a, b) => a + b, 0)} files
        </span>
      </div>
    </div>
  );
}
