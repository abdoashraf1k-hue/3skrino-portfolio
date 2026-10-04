"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaItem, MediaResponse } from "@/app/api/admin/media/route";
import { ago, btn, btnDanger, bytes, card, Empty, input, Loading, micro, Segmented, TabHeader } from "@/components/admin/ui";
import type { Project } from "@/data/projects";
import { AuthError, adminFetch } from "@/lib/admin/client-api";
import { useConfigStore } from "../store";

type Folder = "" | "videos" | "thumbnails" | "hero" | "brands" | "site" | "audio";
const FOLDERS: { value: Folder; label: string }[] = [
  { value: "", label: "All" },
  { value: "videos", label: "Videos" },
  { value: "thumbnails", label: "Thumbnails" },
  { value: "hero", label: "Poses" },
  { value: "brands", label: "Logos" },
  { value: "site", label: "Site images" },
  { value: "audio", label: "Sounds" },
];

type Kind = "image" | "video" | "audio" | "file";
export function mediaKind(path: string): Kind {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (/^(png|jpe?g|webp|svg|gif|avif)$/.test(ext)) return "image";
  if (/^(mp4|webm|mov|m4v)$/.test(ext)) return "video";
  if (/^(mp3|wav|ogg|m4a)$/.test(ext)) return "audio";
  return "file";
}
const fileName = (p: string) => decodeURIComponent(p.split("/").pop() ?? p);

type Props = {
  adminKey: string;
  projects: Project[];
  onAuthError: () => void;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
};

export default function MediaTab({ adminKey, projects, onAuthError, onError, onSuccess }: Props) {
  const { hero, site } = useConfigStore();
  const [folder, setFolder] = useState<Folder>("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string }>({ kind: "loading" });
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(
    async (more: string | null) => {
      try {
        const q = new URLSearchParams({ limit: "200" });
        if (folder) q.set("folder", folder);
        if (more) q.set("cursor", more);
        const res = await adminFetch<MediaResponse>(adminKey, `media?${q}`, "GET");
        setItems((cur) => (more ? [...cur, ...res.items] : res.items));
        setCursor(res.cursor);
        setHasMore(res.hasMore);
        setState({ kind: "ready" });
      } catch (err) {
        if (err instanceof AuthError) return onAuthError();
        setState({ kind: "error", message: err instanceof Error ? err.message : "Couldn't list media" });
      }
    },
    [adminKey, folder, onAuthError],
  );

  useEffect(() => {
    let alive = true;
    const id = requestAnimationFrame(() => {
      if (!alive) return;
      setState({ kind: "loading" });
      void load(null);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [load]);

  // What's referenced by the live configs / projects — deleting those breaks the site.
  const haystack = useMemo(() => JSON.stringify([projects, hero, site]), [projects, hero, site]);
  const inUse = (url: string) => haystack.includes(url);

  const shown = items.filter((i) => !query || i.pathname.toLowerCase().includes(query.toLowerCase()));
  const total = shown.reduce((n, i) => n + i.size, 0);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1400);
    } catch {
      onError("Couldn't copy — select the URL and copy it by hand");
    }
  };

  const remove = async (item: MediaItem) => {
    const used = inUse(item.url);
    const msg = used
      ? `"${fileName(item.pathname)}" is USED by the site (a project, pose, logo or sound). Deleting it breaks that media.\n\nDelete anyway?`
      : `Delete "${fileName(item.pathname)}" from Vercel Blob? This can't be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await adminFetch(adminKey, "media", "DELETE", { url: item.url });
      setItems((cur) => cur.filter((i) => i.url !== item.url));
      setPreview(null);
      onSuccess("Deleted from Blob");
    } catch (err) {
      if (err instanceof AuthError) onAuthError();
      else onError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div>
      <TabHeader
        title="Media Library"
        hint="every file uploaded to Vercel Blob · click one to preview · files used by the site are marked"
        actions={
          <button type="button" className={btn} onClick={() => void load(null)}>
            ↻ Refresh
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented<Folder> label="Type" value={folder} onChange={setFolder} options={FOLDERS} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search filenames…" className={`${input} max-w-xs`} aria-label="Search filenames" />
        <span className={`${micro} text-white/40`}>
          {shown.length} files · {bytes(total)}
          {hasMore ? " · more available" : ""}
        </span>
      </div>

      {state.kind === "loading" && <Loading what="media" />}
      {state.kind === "error" && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="max-w-md text-sm text-[#ff6b6b]">{state.message}</p>
          <button type="button" className={btn} onClick={() => void load(null)}>
            Retry
          </button>
        </div>
      )}
      {state.kind === "ready" && !shown.length && <Empty>{query ? "No file matches that search" : "Nothing uploaded here yet"}</Empty>}

      {state.kind === "ready" && shown.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {shown.map((item) => {
            const kind = mediaKind(item.pathname);
            const used = inUse(item.url);
            return (
              <li key={item.url} className={`${card} group flex flex-col overflow-hidden`}>
                <button type="button" onClick={() => setPreview(item)} className="relative block aspect-square bg-[#0d0d0d]" aria-label={`Preview ${fileName(item.pathname)}`}>
                  <Thumb item={item} kind={kind} />
                  <span className="absolute left-1.5 top-1.5 bg-black/70 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-white/70">{item.folder}</span>
                  {used && <span className="absolute right-1.5 top-1.5 bg-[#e7fe55] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-black">In use</span>}
                </button>
                <div className="flex flex-col gap-0.5 p-2">
                  <span className="truncate text-xs" title={item.pathname}>
                    {fileName(item.pathname)}
                  </span>
                  <span className={`${micro} text-[9px] text-white/35`}>
                    {bytes(item.size)} · {ago(item.uploadedAt)}
                  </span>
                  <div className="mt-1 flex gap-1">
                    <button type="button" className={`${btn} h-6 flex-1 px-1.5`} onClick={() => void copy(item.url)}>
                      {copied === item.url ? "Copied" : "Copy URL"}
                    </button>
                    <button type="button" className={`${btnDanger} h-6 px-1.5`} onClick={() => void remove(item)} aria-label={`Delete ${fileName(item.pathname)}`}>
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && state.kind === "ready" && (
        <div className="mt-6 flex justify-center">
          <button type="button" className={btn} onClick={() => void load(cursor)}>
            Load more
          </button>
        </div>
      )}

      {preview && (
        <div role="dialog" aria-modal="true" aria-label="Preview" className="admin-fade fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-4 backdrop-blur" onClick={() => setPreview(null)}>
          <div className={`${card} flex max-h-full w-full max-w-4xl flex-col bg-[#0d0d0d]`} onClick={(e) => e.stopPropagation()}>
            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2">
              <Full item={preview} />
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{preview.pathname}</p>
                <p className={`${micro} text-[9px] text-white/40`}>
                  {bytes(preview.size)} · uploaded {new Date(preview.uploadedAt).toLocaleString()} · {inUse(preview.url) ? "used by the site" : "not referenced"}
                </p>
              </div>
              <button type="button" className={btn} onClick={() => void copy(preview.url)}>
                {copied === preview.url ? "Copied" : "Copy URL"}
              </button>
              <a className={btn} href={preview.url} target="_blank" rel="noreferrer">
                Open ↗
              </a>
              <button type="button" className={btnDanger} onClick={() => void remove(preview)}>
                Delete
              </button>
              <button type="button" className={btn} onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ item, kind }: { item: MediaItem; kind: Kind }) {
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary blob URLs, admin only
    return <img src={item.url} alt="" loading="lazy" className="absolute inset-0 size-full object-contain p-1" />;
  }
  if (kind === "video") {
    return <video src={`${item.url}#t=0.5`} preload="metadata" muted playsInline className="absolute inset-0 size-full object-cover" />;
  }
  return (
    <span className="absolute inset-0 flex items-center justify-center font-mono text-2xl text-white/30">
      {kind === "audio" ? "♪" : "◇"}
    </span>
  );
}

function Full({ item }: { item: MediaItem }) {
  const kind = mediaKind(item.pathname);
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary blob URLs, admin only
    return <img src={item.url} alt={item.pathname} className="max-h-[70vh] max-w-full object-contain" />;
  }
  if (kind === "video") return <video src={item.url} controls autoPlay muted playsInline className="max-h-[70vh] max-w-full" />;
  if (kind === "audio") return <audio src={item.url} controls autoPlay className="w-full max-w-md" />;
  return <p className={`${micro} p-10 text-white/40`}>No preview for this file type</p>;
}
