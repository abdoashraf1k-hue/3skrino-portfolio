"use client";

import { useCallback, useEffect, useState } from "react";
import type { Backup } from "@/lib/admin/backups";
import { adminFetch, type ProjectsResponse } from "@/lib/admin/client-api";
import { timeAgo } from "@/components/admin/AdminDashboard";

type Props = {
  adminKey: string;
  now: number;
  onRestored: (res: ProjectsResponse) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const btn =
  "border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white/80 hover:border-white/40 disabled:opacity-40";

/** Lists backups/ snapshots, previews one, restores one. */
export default function BackupsClient({ adminKey, now, onRestored, onError, onSuccess }: Props) {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [preview, setPreview] = useState<{ backup: Backup; content: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch<{ backups: Backup[] }>(adminKey, "backups", "GET");
      setBackups(res.backups);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't list backups");
      setBackups([]);
    }
  }, [adminKey, onError]);

  useEffect(() => {
    let alive = true;
    adminFetch<{ backups: Backup[] }>(adminKey, "backups", "GET")
      .then((res) => alive && setBackups(res.backups))
      .catch((err: unknown) => {
        if (!alive) return;
        onError(err instanceof Error ? err.message : "Couldn't list backups");
        setBackups([]);
      });
    return () => {
      alive = false;
    };
  }, [adminKey, onError]);

  const open = async (backup: Backup) => {
    setBusy(backup.path);
    try {
      const res = await adminFetch<{ content: string }>(adminKey, "backups", "POST", { action: "read", path: backup.path });
      setPreview({ backup, content: res.content });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't read backup");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (backup: Backup) => {
    if (
      !window.confirm(
        `Restore data/projects.ts from ${backup.name}?\n\nThe current version is snapshotted first, so this can be undone from this list. The site redeploys.`,
      )
    ) {
      return;
    }
    setBusy(backup.path);
    try {
      const res = await adminFetch<ProjectsResponse>(adminKey, "backups", "POST", { action: "restore", path: backup.path });
      onRestored(res);
      setPreview(null);
      onSuccess(`Restored from ${backup.name} — deploying…`);
      void load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Backups</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/40">
            Every save snapshots the previous projects.ts into backups/ in the same commit · newest 30 kept, older ones auto-pruned
          </p>
        </div>
        <button type="button" className={btn} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {backups === null ? (
        <p className="py-24 text-center font-mono text-[11px] uppercase tracking-widest text-white/40">Loading…</p>
      ) : backups.length === 0 ? (
        <p className="py-24 text-center font-mono text-[11px] uppercase tracking-widest text-white/40">
          No backups yet — the next save creates the first one
        </p>
      ) : (
        <ul className="border border-white/10">
          {backups.map((b, i) => (
            <li key={b.path} className="flex flex-wrap items-center gap-3 border-t border-white/5 px-4 py-3 first:border-t-0">
              <span className="w-8 font-mono text-[10px] text-white/30">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-white/90">{b.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                  {new Date(b.createdAt).toLocaleString()} · {timeAgo(Date.parse(b.createdAt), now)} · {(b.size / 1024).toFixed(1)} KB
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
