"use client";

import { useCallback, useEffect, useState } from "react";
import { ago, btn, btnPrimary, card, Empty, Loading, micro, Section, Segmented, TabHeader } from "@/components/admin/ui";
import type { BackupSchedule } from "@/data/site-config";
import type { Backup, BackupTarget } from "@/lib/admin/backups";
import { AuthError, adminFetch, type ProjectsResponse } from "@/lib/admin/client-api";
import { useConfigStore } from "../store";

const TARGET_LABEL: Record<BackupTarget, string> = {
  projects: "Projects",
  "hero-config": "Hero",
  "site-config": "Site",
};
const SCHEDULES: { value: BackupSchedule; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];
const MAX_AGE_HOURS: Record<Exclude<BackupSchedule, "off">, number> = { daily: 20, weekly: 6.5 * 24, monthly: 29 * 24 };

/** The next 03:00 UTC — when Vercel Cron runs /api/cron/backup. */
function nextCronRun(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** The first cron run at which the newest snapshot will be old enough to trigger a new one. */
function nextBackup(schedule: BackupSchedule, last: string | null): Date | null {
  if (schedule === "off") return null;
  let run = nextCronRun();
  if (!last) return run;
  const due = Date.parse(last) + MAX_AGE_HOURS[schedule] * 3_600_000;
  while (run.getTime() < due) run = new Date(run.getTime() + 86_400_000);
  return run;
}

type Props = {
  adminKey: string;
  onRestoredProjects: (res: ProjectsResponse) => void;
  onAuthError: () => void;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
};

export default function BackupsTab({ adminKey, onRestoredProjects, onAuthError, onError, onSuccess }: Props) {
  const { site, setSite, savedSite, reload } = useConfigStore();
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | BackupTarget>("all");
  const [preview, setPreview] = useState<{ backup: Backup; content: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof AuthError) return onAuthError();
      onError(err instanceof Error ? err.message : fallback);
    },
    [onAuthError, onError],
  );

  const load = useCallback(
    () =>
      adminFetch<{ backups: Backup[]; lastBackup: string | null }>(adminKey, "backups", "GET").then(
        (r) => {
          setBackups(r.backups);
          setLast(r.lastBackup);
        },
        (err: unknown) => {
          setBackups([]);
          fail(err, "Couldn't list backups");
        },
      ),
    [adminKey, fail],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot = async () => {
    setBusy("snapshot");
    try {
      const r = await adminFetch<{ files: number }>(adminKey, "backups", "POST", { action: "snapshot" });
      onSuccess(`Backed up ${r.files} files`);
      void load();
    } catch (err) {
      fail(err, "Backup failed");
    } finally {
      setBusy(null);
    }
  };

  const open = async (backup: Backup) => {
    setBusy(backup.path);
    try {
      const r = await adminFetch<{ content: string }>(adminKey, "backups", "POST", { action: "read", path: backup.path });
      setPreview({ backup, content: r.content });
    } catch (err) {
      fail(err, "Couldn't read backup");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (backup: Backup) => {
    if (
      !window.confirm(
        `Restore ${backup.file} from ${backup.name}?\n\nThe current version is snapshotted first, so this can be undone from this list. The site redeploys.`,
      )
    ) {
      return;
    }
    setBusy(backup.path);
    try {
      const r = await adminFetch<ProjectsResponse & { target: BackupTarget }>(adminKey, "backups", "POST", { action: "restore", path: backup.path });
      if (r.target === "projects") onRestoredProjects(r);
      else await reload();
      setPreview(null);
      onSuccess(`Restored ${TARGET_LABEL[r.target]} from ${backup.name} — deploying…`);
      void load();
    } catch (err) {
      fail(err, "Restore failed");
    } finally {
      setBusy(null);
    }
  };

  const schedule = site?.backups.schedule ?? "weekly";
  const savedSchedule = savedSite?.backups.schedule ?? schedule;
  const next = nextBackup(savedSchedule, last);
  const shown = (backups ?? []).filter((b) => filter === "all" || b.target === filter);

  return (
    <div>
      <TabHeader
        title="Backups"
        hint="every admin save snapshots the file it replaces into backups/ (same commit) · newest 30 per file kept"
        actions={
          <>
            <button type="button" className={btn} onClick={() => void load()}>
              Refresh
            </button>
            <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => void snapshot()}>
              {busy === "snapshot" ? "Backing up…" : "Backup now"}
            </button>
          </>
        }
      />

      <div className="grid gap-x-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0">
          <div className="mb-4">
            <Segmented<"all" | BackupTarget>
              label="File"
              value={filter}
              options={[
                { value: "all", label: "All files" },
                { value: "projects", label: "Projects" },
                { value: "hero-config", label: "Hero" },
                { value: "site-config", label: "Site" },
              ]}
              onChange={setFilter}
            />
          </div>
          {backups === null ? (
            <Loading what="backups" />
          ) : shown.length === 0 ? (
            <Empty>No backups yet — the next save (or “Backup now”) creates one</Empty>
          ) : (
            <ul className="border border-white/10">
              {shown.map((b, i) => (
                <li key={b.path} className="flex flex-wrap items-center gap-3 border-t border-white/5 px-4 py-3 first:border-t-0">
                  <span className="w-6 font-mono text-[10px] text-white/30">{String(i + 1).padStart(2, "0")}</span>
                  <span className="w-16 border border-white/15 px-1.5 py-0.5 text-center font-mono text-[9px] uppercase tracking-widest text-white/60">
                    {TARGET_LABEL[b.target]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-white/90">{b.name}</span>
                    <span className={`${micro} text-white/40`}>
                      {new Date(b.createdAt).toLocaleString()} · {ago(b.createdAt)} · {(b.size / 1024).toFixed(1)} KB
                    </span>
                  </span>
                  <button type="button" className={btn} disabled={busy !== null} onClick={() => void open(b)}>
                    Preview
                  </button>
                  <button type="button" className={`${btn} border-[#e7fe55]/40 text-[#e7fe55]`} disabled={busy !== null} onClick={() => void restore(b)}>
                    {busy === b.path ? "Working…" : "Restore"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="min-w-0">
          <Section title="Schedule" hint="a snapshot of all three files, in one commit (no redeploy)">
            <Segmented label="Schedule" value={schedule} options={SCHEDULES} onChange={(v) => setSite((c) => ({ ...c, backups: { schedule: v } }))} />
            {schedule !== savedSchedule && <p className={`${micro} mt-2 text-[#e7fe55]`}>Unsaved — save to apply</p>}
          </Section>
          <Section title="Scheduled jobs">
            <ul className="flex flex-col gap-2">
              <li className={`${card} p-3`}>
                <p className="font-mono text-xs text-white/85">GET /api/cron/backup</p>
                <p className={`${micro} mt-1 text-white/40`}>Vercel Cron · daily 03:00 UTC · vercel.json</p>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px]">
                  <dt className="text-white/40">Policy</dt>
                  <dd className="text-white/80">{savedSchedule === "off" ? "off — runs skip" : `snapshot when the newest is older than ${savedSchedule === "daily" ? "a day" : savedSchedule === "weekly" ? "a week" : "a month"}`}</dd>
                  <dt className="text-white/40">Last</dt>
                  <dd className="text-white/80">{last ? `${new Date(last).toLocaleString()} (${ago(last)})` : "never"}</dd>
                  <dt className="text-white/40">Next</dt>
                  <dd className="text-white/80">{next ? next.toLocaleString() : "—"}</dd>
                </dl>
              </li>
            </ul>
            <p className={`${micro} mt-2 text-white/30`}>Needs CRON_SECRET set in Vercel (it refuses to run without one).</p>
          </Section>
        </aside>
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${preview.backup.name}`}
          data-lenis-prevent
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreview(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPreview(null);
          }}
          className="admin-fade fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm md:p-10"
        >
          <div className="admin-clip-reveal-up flex max-h-[90vh] w-full max-w-4xl flex-col border border-white/10 bg-[#0a0a0a]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
              <p className="truncate font-mono text-xs">{preview.backup.name}</p>
              <div className="flex gap-2">
                <button type="button" className={`${btn} border-[#e7fe55]/40 text-[#e7fe55]`} disabled={busy !== null} onClick={() => void restore(preview.backup)}>
                  Restore
                </button>
                <button type="button" autoFocus className={btn} onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
            </header>
            <pre className="flex-1 overflow-auto p-5 font-mono text-[11px] leading-relaxed text-white/75">
              <code>{preview.content}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
