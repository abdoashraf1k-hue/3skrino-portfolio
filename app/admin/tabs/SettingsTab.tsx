"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaResponse } from "@/app/api/admin/media/route";
import type { SettingsStatus } from "@/app/api/admin/settings/route";
import { btn, btnDanger, btnPrimary, bytes, card, input, micro, Section, Segmented, Stat, TabHeader } from "@/components/admin/ui";
import type { HeroConfig } from "@/data/hero-config";
import type { Project } from "@/data/projects";
import { AuthError, adminFetch, clearStoredKey } from "@/lib/admin/client-api";
import { migrateVideo } from "@/lib/admin/migrate-client";
import { deleteStoredMedia } from "@/lib/admin/video-upload";
import { isBlobUrl, type ProviderSetting, type StorageStatusResponse, type StoreUsage, type VideoProvider } from "@/lib/admin/storage/contract";
import { useConfigStore } from "../store";

const INTEGRATIONS: { key: keyof SettingsStatus; label: string; env: string; what: string }[] = [
  { key: "github", label: "GitHub", env: "GITHUB_TOKEN · GITHUB_REPO", what: "saves, backups, logs" },
  { key: "blob", label: "Vercel Blob", env: "BLOB_READ_WRITE_TOKEN", what: "video + image uploads" },
  { key: "analytics", label: "Web Analytics API", env: "VERCEL_TOKEN · VERCEL_PROJECT_ID", what: "Analytics tab, dashboard views" },
  { key: "vercelApi", label: "Vercel API", env: "VERCEL_TOKEN · VERCEL_PROJECT_ID", what: "one-click key rotation" },
  { key: "deployHook", label: "Deploy hook", env: "VERCEL_DEPLOY_HOOK_URL", what: "redeploy after key rotation" },
  { key: "cronSecret", label: "Cron secret", env: "CRON_SECRET", what: "scheduled backups" },
];

type Rotated = { key: string; applied: boolean; redeploying: boolean };

type Props = {
  adminKey: string;
  /** Every project — the Storage panel lists the ones still on Vercel Blob. */
  projects: Project[];
  /** Points a project at its migrated video through the normal project save (PUT /api/admin/projects). */
  onSetVideoUrl: (id: string, videoUrl: string) => Promise<void>;
  onAuthError: () => void;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
};

export default function SettingsTab({ adminKey, projects, onSetVideoUrl, onAuthError, onError, onSuccess }: Props) {
  const { adoptHero } = useConfigStore();
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [rotated, setRotated] = useState<Rotated | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    adminFetch<SettingsStatus>(adminKey, "settings", "GET").then(
      (s) => alive && setStatus(s),
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof AuthError) onAuthError();
      },
    );
    return () => {
      alive = false;
    };
  }, [adminKey, onAuthError]);

  const act = async <T,>(action: string, label: string): Promise<T | null> => {
    setBusy(action);
    try {
      return await adminFetch<T>(adminKey, "settings", "POST", { action });
    } catch (err) {
      if (err instanceof AuthError) onAuthError();
      else onError(err instanceof Error ? err.message : `${label} failed`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const rotate = async () => {
    const warning = status?.vercelApi
      ? "Generate a new admin key and write it to the Vercel project?\n\nThe current key keeps working until the next deploy finishes. Copy the new key before leaving this page."
      : "Generate a new admin key?\n\nVercel API access isn't configured, so you'll set it yourself in Project → Settings → Environment Variables.";
    if (!window.confirm(warning)) return;
    const r = await act<Rotated>("rotate-key", "Key rotation");
    if (r) setRotated(r);
  };

  return (
    <div>
      <TabHeader title="Settings" hint="storage, integrations, access and the danger zone" />

      <StorageSection
        adminKey={adminKey}
        projects={projects}
        onSetVideoUrl={onSetVideoUrl}
        onAuthError={onAuthError}
        onError={onError}
        onSuccess={onSuccess}
      />

      <Section title="Integrations" hint="configured on the server — values are never shown here">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {INTEGRATIONS.map((i) => {
            const on = status?.[i.key];
            return (
              <li key={i.key} className={`${card} flex items-start gap-3 p-3`}>
                <span className={`mt-1 size-2 shrink-0 rounded-full ${status === null ? "bg-white/20" : on ? "bg-[#3dffb0]" : "bg-[#ff2d2d]"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{i.label}</span>
                  <span className={`${micro} block text-[9px] text-white/40`}>{i.what}</span>
                  <span className="mt-1 block font-mono text-[10px] text-white/30">{i.env}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Admin key" hint="the ?key=… secret that opens this panel (ADMIN_SECRET_KEY)">
        <div className={`${card} max-w-3xl p-4`}>
          {!rotated ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-60 flex-1 text-sm text-white/65">
                {status?.vercelApi
                  ? "Rotation writes a fresh key to the Vercel project" + (status.deployHook ? " and starts a deploy." : "; redeploy to make it live.")
                  : "Generates a strong key for you to set in Vercel (Vercel API not configured)."}
              </p>
              <button type="button" className={btn} disabled={busy !== null} onClick={() => void rotate()}>
                {busy === "rotate-key" ? "Generating…" : "Rotate key"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className={`${micro} text-[#e7fe55]`}>New key — copy it now, it isn&apos;t shown again</p>
              <div className="flex gap-2">
                <input readOnly value={rotated.key} className={`${input} font-mono`} onFocus={(e) => e.currentTarget.select()} />
                <button
                  type="button"
                  className={btn}
                  onClick={() => {
                    void navigator.clipboard.writeText(rotated.key).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-white/65">
                {rotated.applied ? (
                  <li>Saved to Vercel as ADMIN_SECRET_KEY (production + preview).</li>
                ) : (
                  <li>Vercel → Project → Settings → Environment Variables → set ADMIN_SECRET_KEY to the key above.</li>
                )}
                <li>{rotated.redeploying ? "A deploy has started — the new key works once it's live." : "Redeploy (Deployments → ⋯ → Redeploy)."}</li>
                <li>
                  Then open <code className="text-[#e7fe55]">/admin?key=NEW_KEY</code>. The old key stops working.
                </li>
              </ol>
            </div>
          )}
        </div>
      </Section>

      <Section title="Team" hint="coming later — single-key access for now">
        <div className={`${card} max-w-3xl p-4 opacity-60`}>
          <ul className="mb-3 flex flex-col gap-1">
            <li className="flex items-center gap-3 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-[#e7fe55] text-xs font-black text-black">3</span>
              3SKRINO <span className={`${micro} text-white/40`}>owner</span>
            </li>
          </ul>
          <div className="flex gap-2">
            <input disabled placeholder="teammate@studio.com" className={input} />
            <button type="button" className={btn} disabled>
              Invite
            </button>
          </div>
          <p className={`${micro} mt-2 text-white/35`}>Per-person logins and roles (editor / viewer) need an auth provider — planned.</p>
        </div>
      </Section>

      <Section title="Danger zone">
        <div className="flex max-w-3xl flex-col gap-2">
          {[
            {
              id: "revalidate",
              label: "Revalidate all pages",
              text: "Purge cached pages so the next visit renders fresh (saves already redeploy — this is for stuck caches).",
              run: async () => {
                if (await act("revalidate", "Revalidate")) onSuccess("Cache purged");
              },
            },
            {
              id: "reset-hero",
              label: "Reset hero config",
              text: "Commit factory hero settings — poses, logos, effects, roles. The current file is backed up first.",
              run: async () => {
                if (!window.confirm("Reset the whole hero to factory settings and commit it? (Backed up first; undo from Logs or Backups.)")) return;
                const r = await act<{ config: HeroConfig }>("reset-hero", "Reset");
                if (r) {
                  adoptHero(r.config);
                  onSuccess("Hero reset — deploying…");
                }
              },
            },
            {
              id: "clear",
              label: "Forget this browser",
              text: "Clear the admin key from this tab and the preview-dock layout, then leave.",
              run: async () => {
                clearStoredKey();
                try {
                  localStorage.removeItem("3skrino-admin-preview");
                } catch {
                  // ignore
                }
                window.location.replace("/");
              },
            },
          ].map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 border border-[#ff2d2d]/20 p-3">
              <span className="min-w-60 flex-1">
                <span className="block text-sm font-bold">{d.label}</span>
                <span className="block text-xs text-white/50">{d.text}</span>
              </span>
              <button type="button" className={btnDanger} disabled={busy !== null} onClick={() => void d.run()}>
                {busy === d.id ? "Working…" : d.label}
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Storage — Sprint 12                                                 */
/* ------------------------------------------------------------------ */

const GB = 1024 ** 3;
/** Backblaze B2's free tier. */
const B2_FREE_BYTES = 10 * GB;
/** Vercel Blob Hobby quota when the server doesn't say. */
const BLOB_DEFAULT_QUOTA = 1 * GB;

const PROVIDER_LABEL: Record<VideoProvider, string> = { b2: "Backblaze B2", "vercel-blob": "Vercel Blob" };
const SETTING_OPTIONS: readonly { value: ProviderSetting; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "b2", label: "Backblaze B2" },
  { value: "vercel-blob", label: "Vercel Blob" },
];

type StorageState = { kind: "loading" } | { kind: "ready"; data: StorageStatusResponse } | { kind: "error"; message: string };
type RowState = { phase: "queued" | "running" | "error"; pct: number; error?: string };
type Migrated = { id: string; title: string; oldUrl: string; newUrl: string; size: number; deleted: boolean };

const errText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

/** Settings → Storage: where new videos go, how full each store is, and the Blob → B2 migration. */
function StorageSection({
  adminKey,
  projects,
  onSetVideoUrl,
  onAuthError,
  onError,
  onSuccess,
}: Props) {
  const { site, savedSite, setSite } = useConfigStore();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<StorageState>({ kind: "loading" });
  const [sizes, setSizes] = useState<Map<string, number>>(() => new Map());
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState<"one" | "all" | null>(null);
  const [migrated, setMigrated] = useState<Migrated[]>([]);
  const [deleting, setDeleting] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  // Usage — refetched when the Refresh button bumps `nonce` (state is only set in callbacks).
  useEffect(() => {
    let alive = true;
    adminFetch<StorageStatusResponse>(adminKey, "storage", "GET").then(
      (data) => alive && setState({ kind: "ready", data }),
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof AuthError) onAuthError();
        else setState({ kind: "error", message: errText(err, "Couldn't read storage usage") });
      },
    );
    return () => {
      alive = false;
    };
  }, [adminKey, onAuthError, nonce]);

  // Sizes of the legacy videos (best effort — the list just shows "—" without them).
  useEffect(() => {
    let alive = true;
    adminFetch<MediaResponse>(adminKey, "media?folder=videos&limit=500", "GET").then(
      (r) => alive && setSizes(new Map(r.items.map((i) => [i.url, i.size]))),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [adminKey, nonce]);

  // Stop any migration when the tab unmounts.
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const refresh = () => {
    setState({ kind: "loading" });
    setNonce((n) => n + 1);
  };

  const data = state.kind === "ready" ? state.data : null;
  const b2Ready = Boolean(data?.b2.configured);
  const draft: ProviderSetting = site?.storage?.videoProvider ?? "auto";
  const unsaved = site !== null && savedSite !== null && draft !== (savedSite.storage?.videoProvider ?? "auto");
  /** Where new videos go once the current draft is saved. */
  const effective: VideoProvider | null = !data ? null : draft === "auto" ? (data.b2.configured ? "b2" : "vercel-blob") : draft;

  const legacy = useMemo(() => projects.filter((p) => p.videoUrl && isBlobUrl(p.videoUrl)), [projects]);
  const legacyBytes = legacy.reduce((sum, p) => sum + (sizes.get(p.videoUrl) ?? 0), 0);
  const pendingDeletes = migrated.filter((m) => !m.deleted);

  const patchRow = (id: string, row: RowState | null) =>
    setRows((r) => {
      const next = { ...r };
      if (row) next[id] = row;
      else delete next[id];
      return next;
    });

  /** One video: stream to B2, then point the project at it. Resolves false on failure / cancel. */
  const migrateOne = async (p: Project, signal: AbortSignal): Promise<boolean> => {
    patchRow(p.id, { phase: "running", pct: 0 });
    let lastPct = -1;
    try {
      const { publicUrl, size } = await migrateVideo(p.videoUrl, {
        adminKey,
        signal,
        onProgress: (f) => {
          const pct = Math.floor(f * 100);
          if (pct === lastPct) return;
          lastPct = pct;
          patchRow(p.id, { phase: "running", pct });
        },
      });
      try {
        await onSetVideoUrl(p.id, publicUrl);
      } catch (err) {
        // Nothing points at the copy — remove it so a retry doesn't leave a duplicate in the 10 GB bucket.
        void deleteStoredMedia(publicUrl, adminKey).catch(() => undefined);
        if (err instanceof AuthError) throw err;
        throw new Error(`Copied to B2, but saving the project failed: ${errText(err, "unknown error")} — the original still plays`);
      }
      patchRow(p.id, null);
      setMigrated((m) => [...m, { id: p.id, title: p.title, oldUrl: p.videoUrl, newUrl: publicUrl, size, deleted: false }]);
      return true;
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError();
        patchRow(p.id, null);
        throw err;
      }
      if (isAbort(err) || signal.aborted) {
        patchRow(p.id, null);
        return false;
      }
      patchRow(p.id, { phase: "error", pct: 0, error: errText(err, "Migration failed") });
      return false;
    }
  };

  const runOne = async (p: Project) => {
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setRunning("one");
    try {
      if (await migrateOne(p, ctrl.signal)) onSuccess(`"${p.title}" moved to B2 — deploying…`);
    } catch {
      // auth — already handled
    } finally {
      ctrlRef.current = null;
      setRunning(null);
    }
  };

  /** Sequential — one video at a time keeps the browser and the bucket calm. */
  const runAll = async () => {
    const queue = legacy.slice();
    if (!queue.length) return;
    if (!window.confirm(`Copy ${queue.length} video${queue.length === 1 ? "" : "s"} from Vercel Blob to Backblaze B2, one at a time?\n\nKeep this tab open. Originals are kept until you delete them.`)) return;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setRunning("all");
    setRows(Object.fromEntries(queue.map((p) => [p.id, { phase: "queued", pct: 0 } satisfies RowState])));
    let ok = 0;
    try {
      for (const p of queue) {
        if (ctrl.signal.aborted) break;
        if (await migrateOne(p, ctrl.signal)) ok++;
      }
    } catch {
      // auth — already handled
    } finally {
      // Clear leftover "queued" marks (cancelled before their turn).
      setRows((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.phase !== "queued")));
      ctrlRef.current = null;
      setRunning(null);
    }
    if (ctrl.signal.aborted) onSuccess(`Migration cancelled — ${ok} moved`);
    else if (ok === queue.length) onSuccess(`All ${ok} videos moved to B2 — deploying…`);
    else onError(`${ok} of ${queue.length} videos moved — see the errors below`);
  };

  const cancel = () => ctrlRef.current?.abort();

  const deleteOriginals = async () => {
    // Never delete a file a project still points at (e.g. a save that failed).
    const inUse = new Set(projects.map((p) => p.videoUrl));
    const targets = pendingDeletes.filter((m) => !inUse.has(m.oldUrl));
    if (!targets.length) return;
    const total = targets.reduce((s, m) => s + m.size, 0);
    const warning =
      `Permanently delete ${targets.length} original video${targets.length === 1 ? "" : "s"} (${bytes(total)}) from Vercel Blob?\n\n` +
      "Only do this once the deploy with the new B2 links is LIVE — until then the public site still plays these originals and they'd break.\n" +
      "Older admin backups still point at them; restoring one of those would bring back dead links.\n\nThis can't be undone.";
    if (!window.confirm(warning)) return;
    setDeleting(true);
    let done = 0;
    try {
      for (const m of targets) {
        try {
          await adminFetch(adminKey, "media", "DELETE", { url: m.oldUrl });
          done++;
          setMigrated((all) => all.map((x) => (x.oldUrl === m.oldUrl ? { ...x, deleted: true } : x)));
        } catch (err) {
          if (err instanceof AuthError) {
            onAuthError();
            return;
          }
          onError(`Couldn't delete the original of "${m.title}": ${errText(err, "unknown error")}`);
        }
      }
      if (done) onSuccess(`Deleted ${done} original${done === 1 ? "" : "s"} from Vercel Blob`);
      refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Section
      title="Storage"
      hint="where video files live — Backblaze B2 (cheap, large) or Vercel Blob (legacy)"
      aside={
        <button type="button" className={btn} disabled={state.kind === "loading"} onClick={refresh}>
          {state.kind === "loading" ? "Refreshing…" : "↻ Refresh"}
        </button>
      }
    >
      <div className="flex max-w-5xl flex-col gap-4">
        {/* Provider */}
        <div className={`${card} flex flex-wrap items-center gap-x-6 gap-y-3 p-4`}>
          <div className="min-w-60 flex-1">
            <p className={`${micro} mb-1 flex items-center gap-2 text-white/40`}>
              Active now
              {data ? (
                <span className="border border-[#e7fe55]/40 bg-[#e7fe55]/10 px-2 py-0.5 text-[#e7fe55]">{PROVIDER_LABEL[data.provider]}</span>
              ) : (
                <span className="border border-white/15 px-2 py-0.5 text-white/40">{state.kind === "error" ? "unknown" : "…"}</span>
              )}
            </p>
            <p className="text-sm text-white/65">
              {site === null
                ? "Loading settings…"
                : effective === null
                  ? "New videos go to —"
                  : (
                      <>
                        New videos go to <b className="text-white">{PROVIDER_LABEL[effective]}</b>
                        {draft === "auto" && " (auto: B2 when configured, else Vercel Blob)"}
                        {draft === "b2" && !b2Ready && " — B2 isn't configured, so uploads fall back to Vercel Blob"}
                        {unsaved && <span className="text-[#e7fe55]"> · after you save</span>}
                      </>
                    )}
            </p>
          </div>
          <div className={site === null ? "pointer-events-none opacity-40" : ""} aria-disabled={site === null}>
            <p className={`${micro} mb-1.5 text-white/40`}>New videos go to</p>
            <Segmented<ProviderSetting>
              label="New videos go to"
              value={draft}
              options={SETTING_OPTIONS}
              onChange={(v) => setSite((c) => ({ ...c, storage: { ...c.storage, videoProvider: v } }))}
            />
          </div>
        </div>

        {state.kind === "error" && <p className={`${micro} text-[#ff6b6b]`}>{state.message}</p>}

        {/* Usage */}
        <div className="grid gap-3 md:grid-cols-2">
          <UsageCard
            title="Backblaze B2"
            usage={data?.b2 ?? null}
            limit={B2_FREE_BYTES}
            limitLabel="10 GB free tier"
            details={
              data?.b2.configured
                ? [
                    ["Bucket", data.b2.bucket || "—"],
                    ["Endpoint", data.b2.endpoint || "—"],
                  ]
                : []
            }
            notConfigured="Not configured — set B2_* env vars (docs/STORAGE.md)"
            failed={state.kind === "error"}
          />
          <UsageCard
            title="Vercel Blob"
            usage={data?.blob ?? null}
            limit={data?.blob.quotaBytes || BLOB_DEFAULT_QUOTA}
            limitLabel={`${bytes(data?.blob.quotaBytes || BLOB_DEFAULT_QUOTA)} quota`}
            details={[]}
            notConfigured="Not configured — BLOB_READ_WRITE_TOKEN"
            failed={state.kind === "error"}
          />
        </div>

        {/* Migration */}
        <div className={`${card} p-4`}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="min-w-60 flex-1">
              <p className="text-sm font-bold">Migrate old videos</p>
              <p className={`${micro} text-[9px] text-white/40`}>
                {legacy.length
                  ? `${legacy.length} project${legacy.length === 1 ? "" : "s"} still on Vercel Blob${legacyBytes ? ` · ${bytes(legacyBytes)}` : ""} — copied in this browser, straight to B2`
                  : "every project video is off Vercel Blob"}
              </p>
            </div>
            {running === "all" ? (
              <button type="button" className={btnDanger} onClick={cancel}>
                Cancel
              </button>
            ) : (
              <button type="button" className={btnPrimary} disabled={!b2Ready || running !== null || !legacy.length} onClick={() => void runAll()}>
                Migrate all
              </button>
            )}
          </div>

          {!b2Ready && data && (
            <p className={`${micro} mb-3 text-[9px] text-[#ffb54d]`}>
              Migration needs Backblaze B2 —{" "}
              <span className="cursor-help text-[#e7fe55] underline underline-offset-4" title="docs/STORAGE.md in the repository: bucket, CORS and env vars">
                see docs/STORAGE.md
              </span>
            </p>
          )}

          {legacy.length > 0 && (
            <ul className="flex flex-col divide-y divide-white/5 border-t border-white/10">
              {legacy.map((p) => {
                const row = rows[p.id];
                const size = sizes.get(p.videoUrl);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="min-w-48 flex-1">
                      <span className="block truncate text-sm">{p.title}</span>
                      <span className={`${micro} block text-[9px] text-white/35`}>
                        {p.year} · {size !== undefined ? bytes(size) : "size —"}
                      </span>
                      {row?.phase === "error" && <span className="block text-xs text-[#ff6b6b]">{row.error}</span>}
                    </span>
                    {row?.phase === "running" && (
                      <span className="flex w-40 items-center gap-2">
                        <span className="h-1 flex-1 bg-white/10">
                          <span className="block h-full bg-[#e7fe55] transition-[width]" style={{ width: `${row.pct}%` }} />
                        </span>
                        <span className="w-9 text-right font-mono text-[10px] tabular-nums text-[#e7fe55]">{row.pct}%</span>
                      </span>
                    )}
                    {row?.phase === "queued" && <span className={`${micro} text-[9px] text-white/35`}>queued</span>}
                    {row?.phase === "running" && running === "one" ? (
                      <button type="button" className={btnDanger} onClick={cancel}>
                        Cancel
                      </button>
                    ) : (
                      <button type="button" className={btn} disabled={!b2Ready || running !== null} onClick={() => void runOne(p)}>
                        {row?.phase === "error" ? "Retry" : "Migrate"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {migrated.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <p className={`${micro} flex-1 text-[#3dffb0]`}>Moved this session · {migrated.length}</p>
                {pendingDeletes.length > 0 && (
                  <button type="button" className={btnDanger} disabled={deleting || running !== null} onClick={() => void deleteOriginals()}>
                    {deleting ? "Deleting…" : `Delete originals from Vercel Blob (${pendingDeletes.length})`}
                  </button>
                )}
              </div>
              <ul className="flex flex-col gap-1">
                {migrated.map((m) => (
                  <li key={m.oldUrl} className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                    <span className="size-1.5 rounded-full bg-[#3dffb0]" />
                    <span className="min-w-0 flex-1 truncate">
                      {m.title} · {bytes(m.size)}
                    </span>
                    <span className={`${micro} text-[9px] ${m.deleted ? "text-white/30" : "text-[#ffb54d]"}`}>
                      {m.deleted ? "original deleted" : "original kept"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/** One store: used / limit bar (amber > 80 %, red > 95 %), counts and details. */
function UsageCard({
  title,
  usage,
  limit,
  limitLabel,
  details,
  notConfigured,
  failed = false,
}: {
  title: string;
  usage: StoreUsage | null;
  limit: number;
  limitLabel: string;
  details: [string, string][];
  notConfigured: string;
  /** The status request failed — say so instead of "loading" forever. */
  failed?: boolean;
}) {
  if (!usage) return <Stat label={title} value={failed ? "—" : "…"} sub={failed ? "usage unavailable" : "loading usage"} />;
  const ratio = limit > 0 ? usage.bytes / limit : 0;
  const tone = !usage.configured || usage.error ? "bad" : ratio > 0.95 ? "bad" : ratio > 0.8 ? "warn" : "ok";
  const bar = ratio > 0.95 ? "bg-[#ff2d2d]" : ratio > 0.8 ? "bg-[#ffb54d]" : "bg-[#e7fe55]";
  return (
    <div className={`${card} flex min-w-0 flex-col gap-2 px-4 py-3`}>
      <span className={`${micro} flex items-center gap-1.5 text-[9px] text-white/40`}>
        <span className={`size-1.5 rounded-full ${tone === "ok" ? "bg-[#3dffb0]" : tone === "warn" ? "bg-[#ffb54d]" : "bg-[#ff2d2d]"}`} />
        {title}
        <span className="ml-auto">{usage.configured ? "configured" : "not configured"}</span>
      </span>
      {usage.configured ? (
        <>
          <span className="flex items-baseline gap-2">
            <span className="text-2xl font-black tabular-nums tracking-tight">{bytes(usage.bytes)}</span>
            <span className={`${micro} text-[9px] text-white/35`}>of {limitLabel}</span>
            <span className="ml-auto font-mono text-[11px] tabular-nums text-white/50">{Math.round(ratio * 100)}%</span>
          </span>
          <span
            className="block h-1.5 bg-white/10"
            role="progressbar"
            aria-label={`${title} usage`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(ratio * 100))}
          >
            <span className={`block h-full ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </span>
          <span className={`${micro} text-[9px] text-white/35`}>
            {usage.count} object{usage.count === 1 ? "" : "s"} · {usage.videos} video{usage.videos === 1 ? "" : "s"}
          </span>
          {details.map(([k, v]) => (
            <span key={k} className="flex gap-2 font-mono text-[10px] text-white/45">
              <span className="w-16 shrink-0 uppercase tracking-widest text-white/30">{k}</span>
              <span className="truncate">{v}</span>
            </span>
          ))}
        </>
      ) : (
        <span className="text-sm text-white/50">{notConfigured}</span>
      )}
      {usage.error && <span className="text-xs text-[#ff6b6b]">{usage.error}</span>}
    </div>
  );
}
