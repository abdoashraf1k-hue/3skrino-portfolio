"use client";

import { useCallback, useEffect, useState } from "react";
import { ago, btn, btnDanger, card, Empty, Loading, micro, TabHeader } from "@/components/admin/ui";
import { AuthError, adminFetch } from "@/lib/admin/client-api";
import type { CommitFile, CommitSummary } from "@/lib/admin/github";
import type { LogEntry } from "@/lib/admin/logs";

type Detail = CommitSummary & { parent: string | null; files: CommitFile[] };

const KIND: Record<LogEntry["kind"], string> = {
  admin: "border-[#e7fe55]/40 text-[#e7fe55]",
  restore: "border-[#5fe3ff]/40 text-[#5fe3ff]",
  backup: "border-white/20 text-white/50",
  revert: "border-[#ffb54d]/40 text-[#ffb54d]",
};

/** Data files an undo can touch (backups/ changes ride along and aren't undone). */
const DATA = /^data\/(projects|hero-config|site-config|brand)\.ts$/;

function Diff({ patch }: { patch?: string }) {
  if (!patch) return <p className={`${micro} px-3 py-2 text-white/30`}>No text diff (binary or too large)</p>;
  return (
    <pre className="max-h-[50vh] overflow-auto py-2 font-mono text-[11px] leading-[1.55]">
      {patch.split("\n").map((line, i) => {
        const tone = line.startsWith("+")
          ? "bg-[#3dffb0]/[0.07] text-[#9dffd6]"
          : line.startsWith("-")
            ? "bg-[#ff2d2d]/[0.08] text-[#ff9a9a]"
            : line.startsWith("@@")
              ? "text-[#5fe3ff]/70"
              : "text-white/45";
        return (
          <span key={i} className={`block whitespace-pre px-3 ${tone}`}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

type Props = {
  adminKey: string;
  onAuthError: () => void;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
  /** After an undo: reload projects + configs. */
  onChanged: () => void;
};

export default function LogsTab({ adminKey, onAuthError, onError, onSuccess, onChanged }: Props) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Detail>>({});
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
      adminFetch<{ entries: LogEntry[] }>(adminKey, "logs", "GET").then(
        (r) => setEntries(r.entries),
        (err: unknown) => {
          setEntries([]);
          fail(err, "Couldn't load the log");
        },
      ),
    [adminKey, fail],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (sha: string) => {
    if (open === sha) return setOpen(null);
    setOpen(sha);
    if (detail[sha]) return;
    try {
      const r = await adminFetch<{ commit: Detail }>(adminKey, `logs?sha=${sha}`, "GET");
      setDetail((d) => ({ ...d, [sha]: r.commit }));
    } catch (err) {
      fail(err, "Couldn't load that commit");
    }
  };

  const undo = async (e: LogEntry) => {
    const files = detail[e.sha]?.files.filter((f) => DATA.test(f.filename)).map((f) => f.filename) ?? [];
    if (
      !window.confirm(
        `Undo "${e.message.split("\n")[0]}"?\n\n${files.length ? files.join("\n") : "Its data files"} go back to how they were before it. The current versions are backed up first, and the site redeploys.`,
      )
    ) {
      return;
    }
    setBusy(e.sha);
    try {
      await adminFetch(adminKey, "logs", "POST", { action: "revert", sha: e.sha });
      onSuccess("Undone — deploying…");
      onChanged();
      void load();
    } catch (err) {
      fail(err, "Undo failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <TabHeader
        title="Logs"
        hint="every change made through the admin, newest first · open one to see its diff · undo puts its data files back"
        actions={
          <button type="button" className={btn} onClick={() => void load()}>
            Refresh
          </button>
        }
      />
      {entries === null ? (
        <Loading what="history" />
      ) : entries.length === 0 ? (
        <Empty>No admin commits yet</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((e) => {
            const d = detail[e.sha];
            const subject = e.message.split("\n")[0];
            const undoable = e.kind !== "backup" && (!d || d.files.some((f) => DATA.test(f.filename)));
            return (
              <li key={e.sha} className={card}>
                <button type="button" onClick={() => void toggle(e.sha)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left">
                  <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${KIND[e.kind]}`}>{e.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{subject.replace(/^\w+:\s*/, "")}</span>
                  <span className={`${micro} text-[9px] text-white/35`} title={new Date(e.date).toLocaleString()}>
                    {ago(e.date)} · {e.sha.slice(0, 7)}
                  </span>
                  <span className="text-white/40">{open === e.sha ? "−" : "+"}</span>
                </button>
                {open === e.sha && (
                  <div className="border-t border-white/10">
                    {!d ? (
                      <p className={`${micro} p-3 text-white/40`}>Loading diff…</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                          <span className={`${micro} text-white/40`}>
                            {d.author} · {new Date(d.date).toLocaleString()}
                          </span>
                          <a href={d.url} target="_blank" rel="noreferrer" className={`${micro} text-white/50 underline-offset-4 hover:text-white hover:underline`}>
                            GitHub ↗
                          </a>
                          {undoable && (
                            <button type="button" className={`${btnDanger} ml-auto`} disabled={busy !== null} onClick={() => void undo(e)}>
                              {busy === e.sha ? "Undoing…" : "Undo this change"}
                            </button>
                          )}
                        </div>
                        {d.files.map((f) => (
                          <div key={f.filename} className="border-t border-white/5">
                            <p className="flex items-center gap-3 px-3 py-1.5 font-mono text-[11px]">
                              <span className="min-w-0 flex-1 truncate text-white/80">{f.filename}</span>
                              <span className="text-[#9dffd6]">+{f.additions}</span>
                              <span className="text-[#ff9a9a]">−{f.deletions}</span>
                            </p>
                            {DATA.test(f.filename) && <Diff patch={f.patch} />}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
