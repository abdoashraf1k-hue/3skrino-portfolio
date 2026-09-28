"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import CategoryGrid from "@/components/admin/CategoryGrid";
import ProjectEditor, { type EditorTarget } from "@/components/admin/ProjectEditor";
import { ToastProvider, useToast } from "@/components/admin/Toast";
import type { Project } from "@/data/projects";
import {
  AuthError,
  adminFetch,
  clearStoredKey,
  readStoredKey,
  storeKey,
  type ProjectsResponse,
} from "@/lib/admin/client-api";

const POLL_MS = 30_000;
const TICK_MS = 15_000;

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; message: string };

export default function AdminClient() {
  return (
    <ToastProvider>
      <Admin />
    </ToastProvider>
  );
}

/** Rebuilds the full order: this category's slots take `ids` in turn; every other project stays put. */
function mergeCategoryOrder(all: Project[], category: string, ids: string[]): Project[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const queue = ids.map((id) => byId.get(id)).filter((p): p is Project => Boolean(p));
  return all.map((p) => (p.category === category ? (queue.shift() ?? p) : p));
}

function syncedLabel(syncedAt: number | null, now: number): string {
  if (syncedAt === null) return "Connecting…";
  const mins = Math.floor(Math.max(0, now - syncedAt) / 60_000);
  return mins < 1 ? "Synced just now" : `Synced ${mins}m ago`;
}

function Admin() {
  const toast = useToast();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const keyRef = useRef("");
  const inFlightWrites = useRef(0);
  const writeGen = useRef(0); // bumps on every write so stale polls are discarded
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const applyServer = useCallback((res: ProjectsResponse) => {
    setProjects(res.projects);
    setSyncedAt(Date.now());
    setNow(Date.now());
  }, []);

  const deny = useCallback(() => {
    clearStoredKey();
    setEditor(null);
    setStatus({ kind: "denied" });
  }, []);

  /** GET the file from GitHub. Skipped while a write is in flight. */
  const refresh = useCallback(
    async (initial = false) => {
      if (inFlightWrites.current > 0) return;
      const gen = writeGen.current;
      try {
        const res = await adminFetch<ProjectsResponse>(keyRef.current, "projects", "GET");
        if (gen !== writeGen.current || inFlightWrites.current > 0) return; // a write landed meanwhile
        applyServer(res);
        setStatus({ kind: "ready" });
      } catch (err) {
        if (err instanceof AuthError) return deny();
        const message = err instanceof Error ? err.message : "Couldn't load projects";
        if (initial) setStatus({ kind: "error", message });
      }
    },
    [applyServer, deny],
  );

  /** Serialises writes so commits land in the order they were made. */
  const runWrite = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    inFlightWrites.current++;
    writeGen.current++;
    const run = writeQueue.current.then(fn, fn);
    writeQueue.current = run.catch(() => undefined);
    return run.finally(() => {
      inFlightWrites.current--;
    });
  }, []);

  // Boot: take the key from the URL (the server already checked it) or this tab's session.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("key");
    keyRef.current = fromUrl || readStoredKey();
    if (keyRef.current) storeKey(keyRef.current);
    void refresh(true);
  }, [refresh]);

  // Poll every 30s (only while the tab is visible) + tick the "Xm ago" label.
  useEffect(() => {
    const poll = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  // A file dropped outside a drop zone must not navigate the tab away.
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

  const withAuth = async <T,>(p: Promise<T>): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      if (err instanceof AuthError) deny();
      throw err;
    }
  };

  const saveProject = async (project: Project) => {
    if (!editor) return;
    const key = keyRef.current;
    const res = await withAuth(
      runWrite(() => {
        if (editor.mode === "new") {
          return adminFetch<ProjectsResponse>(key, "projects", "POST", { project });
        }
        const { id, ...patch } = project;
        return adminFetch<ProjectsResponse>(key, "projects", "PUT", { id, patch });
      }),
    );
    applyServer(res);
    setEditor(null);
    toast.success("Saved — deploying…");
  };

  const deleteProject = async (id: string) => {
    const key = keyRef.current;
    const res = await withAuth(runWrite(() => adminFetch<ProjectsResponse>(key, "projects", "DELETE", { id })));
    applyServer(res);
    setEditor(null);
    toast.success("Deleted — deploying…");
  };

  const reorder = (category: string, ids: string[]) => {
    const before = projects;
    const next = mergeCategoryOrder(before, category, ids);
    if (next.every((p, i) => p.id === before[i]?.id)) return;
    setProjects(next); // optimistic
    const key = keyRef.current;
    withAuth(runWrite(() => adminFetch<ProjectsResponse>(key, "reorder", "POST", { ids: next.map((p) => p.id) })))
      .then((res) => {
        applyServer(res);
        toast.info("Order saved — deploying…");
      })
      .catch((err: unknown) => {
        setProjects(before); // revert
        if (!(err instanceof AuthError)) toast.error(err instanceof Error ? err.message : "Reorder failed");
      });
  };

  const logout = () => {
    clearStoredKey();
    window.location.replace("/");
  };

  if (status.kind === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-[#ff5a5a]">Access denied</p>
        <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-white/60 underline-offset-4 hover:underline">
          Back to site
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Pin: the header sticks while the grid scrolls beneath it. */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 md:px-8">
          <p className="text-sm font-black uppercase tracking-widest">
            3SKRINO <span className="text-white/30">—</span> <span className="text-[#e7fe55]">Admin</span>
          </p>
          <div className="flex items-center gap-3 md:gap-5">
            <button
              type="button"
              onClick={() => void refresh()}
              title="Refresh now"
              className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white"
            >
              <span
                className={`size-1.5 rounded-full ${
                  status.kind === "ready" ? "bg-[#e7fe55]" : status.kind === "error" ? "bg-[#ff2d2d]" : "bg-white/30"
                }`}
              />
              <span className="hidden sm:inline">{syncedLabel(syncedAt, now)}</span>
            </button>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="hidden font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white md:inline"
            >
              View site ↗
            </a>
            <button
              type="button"
              onClick={logout}
              className="border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white/70 hover:border-white/40 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Projects</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/40">
              {status.kind === "ready" ? `${projects.length} total · ` : ""}drop a video on a category · drag rows to reorder
              · long-press on touch
            </p>
          </div>
        </div>

        {status.kind === "loading" && (
          <p className="py-24 text-center font-mono text-[11px] uppercase tracking-widest text-white/40">Loading from GitHub…</p>
        )}
        {status.kind === "error" && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="max-w-md text-sm text-[#ff5a5a]">{status.message}</p>
            <button
              type="button"
              onClick={() => void refresh(true)}
              className="border border-white/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest hover:border-white/40"
            >
              Retry
            </button>
          </div>
        )}
        {status.kind === "ready" && (
          <CategoryGrid
            projects={projects}
            onNew={(category, file) => setEditor({ mode: "new", category, file })}
            onEdit={(project) => setEditor({ mode: "edit", project })}
            onReorder={reorder}
            onError={toast.error}
          />
        )}
      </div>

      {editor && (
        <ProjectEditor
          key={editor.mode === "edit" ? editor.project.id : `new-${editor.category}`}
          target={editor}
          onClose={() => setEditor(null)}
          onSubmit={saveProject}
          onDelete={deleteProject}
          onError={toast.error}
        />
      )}
    </>
  );
}
