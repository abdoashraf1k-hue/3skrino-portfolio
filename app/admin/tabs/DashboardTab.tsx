"use client";

import { useEffect, useState } from "react";
import type { DashboardResponse } from "@/app/api/admin/dashboard/route";
import type { StatsResponse } from "@/app/api/admin/stats/route";
import { ago, btn, btnPrimary, bytes, card, micro, Section, Sparkline, Stat, TabHeader } from "@/components/admin/ui";
import type { Project } from "@/data/projects";
import { AuthError, adminFetch } from "@/lib/admin/client-api";

const DAYS = 30;

/** Projects created per day over the last 30 days (oldest → today). */
function additions(projects: Project[], now: number): number[] {
  const out = Array<number>(DAYS).fill(0);
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  for (const p of projects) {
    if (!p.createdAt) continue;
    const d = new Date(p.createdAt);
    d.setUTCHours(0, 0, 0, 0);
    const ago = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (ago >= 0 && ago < DAYS) out[DAYS - 1 - ago]++;
  }
  return out;
}

const DEPLOY_TONE: Record<string, "ok" | "warn" | "bad"> = {
  success: "ok",
  pending: "warn",
  in_progress: "warn",
  queued: "warn",
  failure: "bad",
  error: "bad",
};

type Props = {
  adminKey: string;
  projects: Project[];
  stats: StatsResponse | null;
  now: number;
  onAuthError: () => void;
  onNewProject: () => void;
  onBulkUpload: () => void;
  onBackupNow: () => Promise<void>;
  onOpenLogs: () => void;
};

export default function DashboardTab({ adminKey, projects, stats, now, onAuthError, onNewProject, onBulkUpload, onBackupNow, onOpenLogs }: Props) {
  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      adminFetch<DashboardResponse>(adminKey, "dashboard", "GET").then(
        (d) => alive && setDash(d),
        (err: unknown) => {
          if (alive && err instanceof AuthError) onAuthError();
        },
      );
    void load();
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [adminKey, onAuthError]);

  const blob = stats?.blob;
  const added = additions(projects, now);
  const uploads = blob?.uploadsByDay ?? Array<number>(DAYS).fill(0);
  const views = dash?.views ?? null;
  const deploy = dash?.deploy ?? null;
  const featured = projects.filter((p) => p.featured).length;

  return (
    <div>
      <TabHeader
        title="Dashboard"
        hint="the studio at a glance"
        actions={
          <>
            <button type="button" className={btnPrimary} onClick={onNewProject}>
              + New project
            </button>
            <button type="button" className={btn} onClick={onBulkUpload}>
              Bulk upload
            </button>
            <button
              type="button"
              className={btn}
              disabled={backingUp}
              onClick={() => {
                setBackingUp(true);
                void onBackupNow().finally(() => setBackingUp(false));
              }}
            >
              {backingUp ? "Backing up…" : "Backup now"}
            </button>
          </>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Projects" value={projects.length} sub={`${featured} featured · ${projects.filter((p) => p.orientation === "vertical").length} vertical`} />
        <Stat
          label="Views · 30 days"
          value={dash?.totalViews != null ? dash.totalViews.toLocaleString() : "—"}
          sub={dash && dash.totalViews == null ? "connect Vercel Analytics (Settings)" : "Vercel Web Analytics"}
        />
        <Stat label="Videos uploaded" value={blob?.configured ? blob.videos : "—"} sub={blob?.configured ? bytes(blob.videoBytes) : "Blob not configured"} />
        <Stat label="Storage" value={blob?.configured ? bytes(blob.bytes) : "—"} sub={blob?.configured ? `${blob.count} files` : ""} />
      </div>

      <div className="mb-8 grid gap-2 lg:grid-cols-3">
        {[
          { label: "Views", values: views, sub: views ? `${views.reduce((a, b) => a + b, 0).toLocaleString()} in 30 days` : "no analytics yet" },
          { label: "Uploads", values: uploads, sub: `${uploads.reduce((a, b) => a + b, 0)} files in 30 days` },
          { label: "Project additions", values: added, sub: `${added.reduce((a, b) => a + b, 0)} in 30 days` },
        ].map((s) => (
          <div key={s.label} className={`${card} flex flex-col gap-2 px-4 py-3`}>
            <span className={`${micro} text-[9px] text-white/40`}>{s.label} · 30 days</span>
            {s.values ? <Sparkline values={s.values} label={`${s.label} per day over 30 days`} /> : <span className="h-9" />}
            <span className={`${micro} text-[9px] text-white/35`}>{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-x-8 xl:grid-cols-2">
        <Section
          title="Recent activity"
          aside={
            <button type="button" className={btn} onClick={onOpenLogs}>
              All logs →
            </button>
          }
        >
          {!dash ? (
            <p className={`${micro} py-6 text-white/35`}>Loading…</p>
          ) : dash.activity.length === 0 ? (
            <p className={`${micro} py-6 text-white/35`}>No admin changes yet</p>
          ) : (
            <ol className="flex flex-col">
              {dash.activity.map((a) => (
                <li key={a.sha} className="flex items-center gap-3 border-t border-white/5 py-2.5 first:border-t-0">
                  <span className="size-1.5 shrink-0 rounded-full bg-[#e7fe55]" />
                  <span className="min-w-0 flex-1 truncate text-sm">{a.message.split("\n")[0].replace(/^\w+:\s*/, "")}</span>
                  <span className={`${micro} text-[9px] text-white/35`}>{ago(a.date, now)}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Site health">
          <ul className="grid gap-2 sm:grid-cols-2">
            <li>
              <Stat
                label="Last deploy"
                tone={deploy ? (DEPLOY_TONE[deploy.state] ?? "warn") : undefined}
                value={<span className="text-base uppercase">{deploy ? deploy.state.replace("_", " ") : dash ? "unknown" : "…"}</span>}
                sub={deploy ? `${ago(deploy.createdAt, now)} · ${deploy.sha.slice(0, 7)} · ${deploy.environment}` : "from GitHub deployment statuses"}
              />
            </li>
            <li>
              <Stat label="Last edit" value={<span className="text-base">{ago(stats?.lastEdit, now)}</span>} sub="data/projects.ts" />
            </li>
            <li>
              <Stat
                label="Last backup"
                tone={dash?.lastBackup ? (now - Date.parse(dash.lastBackup) < 8 * 86_400_000 ? "ok" : "warn") : undefined}
                value={<span className="text-base">{ago(dash?.lastBackup, now)}</span>}
                sub="backups/"
              />
            </li>
            <li>
              <Stat label="Blob storage" value={<span className="text-base">{blob?.configured ? bytes(blob.bytes) : "—"}</span>} sub={blob?.configured ? `${blob.images} images` : "not configured"} />
            </li>
          </ul>
          {deploy?.url && (
            <a href={deploy.url} target="_blank" rel="noreferrer" className={`${micro} mt-3 inline-block text-white/50 underline-offset-4 hover:text-white hover:underline`}>
              Open deployment ↗
            </a>
          )}
        </Section>
      </div>
    </div>
  );
}
