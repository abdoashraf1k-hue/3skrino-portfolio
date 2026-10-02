"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminFilters, {
  filtersFromParams,
  isFiltering,
  useFilteredProjects,
  writeFiltersToUrl,
  type Filters,
} from "@/components/admin/AdminFilters";
import BulkBar, { type BulkAction } from "@/components/admin/BulkBar";
import CategoryGrid from "@/components/admin/CategoryGrid";
import ProjectEditor, { type EditorTarget } from "@/components/admin/ProjectEditor";
import { ToastProvider, useToast } from "@/components/admin/Toast";
import { categories } from "@/data/categories";
import type { Project } from "@/data/projects";
import type { StatsResponse } from "@/app/api/admin/stats/route";
import {
  AuthError,
  adminFetch,
  clearStoredKey,
  readStoredKey,
  storeKey,
  type ProjectsResponse,
} from "@/lib/admin/client-api";
import BackupsClient from "./BackupsClient";

const POLL_MS = 30_000;
const TICK_MS = 15_000;

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; message: string };
type Tab = "projects" | "backups";
type WithProject = ProjectsResponse & { project: Project };

export default function AdminClient({ initialParams }: { initialParams: Record<string, string> }) {
  return (
    <ToastProvider>
      <Admin initialParams={initialParams} />
    </ToastProvider>
  );
}

/** The key the user typed into the URL (already checked server-side), else this tab's session copy. */
function readKey(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("key") || readStoredKey();
}

/** Rebuilds the full order: this category's slots take `ids` in turn; every other project stays put. */
function mergeCategoryOrder(all: Project[], category: string, ids: string[]): Project[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const queue = ids.map((id) => byId.get(id)).filter((p): p is Project => Boolean(p));
  return all.map((p) => (p.category === category ? (queue.shift() ?? p) : p));
}

/** Moves `id` into `category`, inserted before that category's `index`-th project. */
function moveInto(all: Project[], id: string, category: string, index: number): Project[] {
  const moving = all.find((p) => p.id === id);
  if (!moving) return all;
  const rest = all.filter((p) => p.id !== id);
  const targets = rest.filter((p) => p.category === category);
  const before = targets[index];
  const moved = { ...moving, category };
  if (before) {
    const at = rest.indexOf(before);
    return [...rest.slice(0, at), moved, ...rest.slice(at)];
  }
  const last = targets[targets.length - 1];
  const at = last ? rest.indexOf(last) + 1 : rest.length;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

function isTyping(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function Admin({ initialParams }: { initialParams: Record<string, string> }) {
  const toast = useToast();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(new URLSearchParams(initialParams)));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [tab, setTab] = useState<Tab>(initialParams.tab === "backups" ? "backups" : "projects");
  const [adminKey] = useState(readKey);

  const keyRef = useRef(adminKey);
  const searchRef = useRef<HTMLInputElement>(null);
  const booted = useRef(false);
  const inFlightWrites = useRef(0);
  const writeGen = useRef(0); // bumps on every write so stale polls are discarded
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const filtering = isFiltering(filters);
  const visible = useFilteredProjects(projects, filters);
  const years = useMemo(() => [...new Set(projects.map((p) => p.year))].sort((a, b) => b - a), [projects]);

  const applyServer = useCallback((res: ProjectsResponse) => {
    setProjects(res.projects);
    setSyncedAt(Date.now());
    setNow(Date.now());
    // Drop selections that no longer exist.
    setSelected((sel) => {
      const ids = new Set(res.projects.map((p) => p.id));
      const next = new Set([...sel].filter((id) => ids.has(id)));
      return next.size === sel.size ? sel : next;
    });
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

  const refreshStats = useCallback(async () => {
    try {
      setStats(await adminFetch<StatsResponse>(keyRef.current, "stats", "GET"));
    } catch {
      // The dashboard just shows "—" for what it couldn't load.
    }
  }, []);

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

  // Boot: remember the key for this tab's session, then load.
  useEffect(() => {
    keyRef.current = adminKey;
    if (adminKey) storeKey(adminKey);
    booted.current = true;
    void refresh(true);
    void refreshStats();
  }, [adminKey, refresh, refreshStats]);

  // Filters → URL (debounced), so a filtered view is shareable/bookmarkable.
  useEffect(() => {
    if (!booted.current) return;
    const id = window.setTimeout(() => writeFiltersToUrl(filters), 250);
    return () => window.clearTimeout(id);
  }, [filters]);

  const switchTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "backups") url.searchParams.set("tab", "backups");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
  };

  // Poll every 30s (only while the tab is visible) + tick the "Xm ago" labels.
  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.hidden) return;
      void refresh();
      void refreshStats();
    }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh, refreshStats]);

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

  const newProject = useCallback(() => {
    setTab("projects");
    setEditor({ mode: "new", category: filters.cat || categories[0].id });
  }, [filters.cat]);

  // Shortcuts: Ctrl/⌘+K search · Ctrl/⌘+N (or plain N) new project. The editor owns Esc and Ctrl/⌘+S.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editor || status.kind !== "ready") return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "k") {
        e.preventDefault();
        setTab("projects");
        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        });
      } else if ((mod && k === "n") || (k === "n" && !e.altKey && !mod && !isTyping(e.target))) {
        // Browsers reserve Ctrl/⌘+N for a new window in most cases — plain "N" always works.
        e.preventDefault();
        newProject();
      } else if (k === "escape" && selected.size && !isTyping(e.target)) {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, newProject, selected.size, status.kind]);

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
        if (editor.mode === "new") return adminFetch<ProjectsResponse>(key, "projects", "POST", { project });
        const { id, ...patch } = project;
        return adminFetch<ProjectsResponse>(key, "projects", "PUT", { id, patch });
      }),
    );
    applyServer(res);
    setEditor(null);
    toast.success("Saved — deploying…");
    void refreshStats();
  };

  /** Optimistic: gone from the list at once; restored if the commit fails. */
  const deleteProject = async (id: string) => {
    const before = projects;
    setProjects((all) => all.filter((p) => p.id !== id));
    setEditor(null);
    try {
      const res = await withAuth(runWrite(() => adminFetch<ProjectsResponse>(keyRef.current, "projects", "DELETE", { id })));
      applyServer(res);
      toast.success("Deleted — deploying…");
    } catch (err) {
      setProjects(before);
      if (!(err instanceof AuthError)) toast.error(err instanceof Error ? `Delete reverted: ${err.message}` : "Delete failed");
    }
  };

  const duplicateProject = async (id: string) => {
    const res = await withAuth(runWrite(() => adminFetch<WithProject>(keyRef.current, "projects", "POST", { duplicateOf: id })));
    applyServer(res);
    toast.success(`Duplicated as "${res.project.title}"`);
    setEditor({ mode: "edit", project: res.project });
  };

  const reorder = (category: string, ids: string[]) => {
    const before = projects;
    const next = mergeCategoryOrder(before, category, ids);
    if (next.every((p, i) => p.id === before[i]?.id)) return;
    setProjects(next); // optimistic
    withAuth(runWrite(() => adminFetch<ProjectsResponse>(keyRef.current, "reorder", "POST", { ids: next.map((p) => p.id) })))
      .then((res) => {
        applyServer(res);
        toast.info("Order saved — deploying…");
      })
      .catch((err: unknown) => {
        setProjects(before); // revert
        if (!(err instanceof AuthError)) toast.error(err instanceof Error ? err.message : "Reorder failed");
      });
  };

  /** Cross-category drag: re-home the project and keep the drop position. */
  const moveIn = (id: string, category: string, index: number) => {
    const before = projects;
    const next = moveInto(before, id, category, index);
    setProjects(next);
    withAuth(
      runWrite(() =>
        adminFetch<ProjectsResponse>(keyRef.current, "bulk", "POST", {
          action: "move",
          ids: [id],
          category,
          order: next.map((p) => p.id),
        }),
      ),
    )
      .then((res) => {
        applyServer(res);
        toast.info(`Moved to ${categories.find((c) => c.id === category)?.name ?? category} — deploying…`);
      })
      .catch((err: unknown) => {
        setProjects(before);
        if (!(err instanceof AuthError)) toast.error(err instanceof Error ? err.message : "Move failed");
      });
  };

  const runBulk = async (op: BulkAction) => {
    const ids = [...selected];
    const set = new Set(ids);
    const before = projects;
    setBulkBusy(true);
    // Optimistic preview of the result.
    setProjects((all) => {
      if (op.action === "delete") return all.filter((p) => !set.has(p.id));
      return all.map((p) =>
        !set.has(p.id)
          ? p
          : op.action === "category"
            ? { ...p, category: op.category }
            : { ...p, featured: op.action === "feature" },
      );
    });
    try {
      const res = await withAuth(
        runWrite(() =>
          adminFetch<ProjectsResponse>(keyRef.current, "bulk", "POST", {
            action: op.action,
            ids,
            ...(op.action === "category" ? { category: op.category } : {}),
          }),
        ),
      );
      applyServer(res);
      setSelected(new Set());
      toast.success(`${ids.length} project${ids.length === 1 ? "" : "s"} updated — deploying…`);
    } catch (err) {
      setProjects(before);
      if (!(err instanceof AuthError)) toast.error(err instanceof Error ? `Reverted: ${err.message}` : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = (ids: string[], on: boolean) =>
    setSelected((sel) => {
      const next = new Set(sel);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

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

  const navBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => switchTab(t)}
      aria-current={tab === t ? "page" : undefined}
      className={`font-mono text-[10px] uppercase tracking-widest ${tab === t ? "text-[#e7fe55]" : "text-white/50 hover:text-white"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Pin: the header sticks while the grid scrolls beneath it. */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 md:px-8">
          <p className="text-sm font-black uppercase tracking-widest">
            3SKRINO <span className="text-white/30">—</span> <span className="text-[#e7fe55]">Admin</span>
          </p>
          <div className="flex items-center gap-3 md:gap-5">
            {navBtn("projects", "Projects")}
            {navBtn("backups", "Backups")}
            <button
              type="button"
              onClick={() => {
                void refresh();
                void refreshStats();
              }}
              title="Refresh now"
              className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white"
            >
              <span
                className={`size-1.5 rounded-full ${
                  status.kind === "ready" ? "bg-[#e7fe55]" : status.kind === "error" ? "bg-[#ff2d2d]" : "bg-white/30"
                }`}
              />
              <span className="hidden lg:inline">
                {syncedAt === null ? "Connecting…" : now - syncedAt < 60_000 ? "Synced just now" : `Synced ${Math.floor((now - syncedAt) / 60_000)}m ago`}
              </span>
            </button>
            <a href="/" target="_blank" rel="noreferrer" className="hidden font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white md:inline">
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

      <div className="mx-auto max-w-[1600px] px-4 py-8 pb-32 md:px-8">
        {tab === "backups" ? (
          <BackupsClient
            adminKey={adminKey}
            now={now}
            onRestored={applyServer}
            onError={toast.error}
            onSuccess={toast.success}
          />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Projects</h1>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/40">
                  drop a video on a category · drag rows to reorder or into another category · N new · Ctrl K search
                </p>
              </div>
              <button
                type="button"
                onClick={newProject}
                className="bg-[#e7fe55] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0a0a0a] hover:bg-[#f0ff8a]"
              >
                + New project
              </button>
            </div>

            {status.kind === "ready" && <AdminDashboard projects={projects} stats={stats} syncedAt={syncedAt} now={now} />}

            {status.kind === "ready" && (
              <AdminFilters
                value={filters}
                onChange={setFilters}
                years={years}
                resultCount={visible.length}
                total={projects.length}
                searchRef={searchRef}
              />
            )}

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
                projects={visible}
                filtering={filtering}
                selected={selected}
                onToggleSelect={toggleSelect}
                onSelectAll={selectAll}
                onNew={(category, file) => setEditor({ mode: "new", category, file })}
                onEdit={(project) => setEditor({ mode: "edit", project })}
                onReorder={reorder}
                onMoveIn={moveIn}
                onError={toast.error}
              />
            )}
          </>
        )}
      </div>

      {selected.size > 0 && tab === "projects" && (
        <BulkBar count={selected.size} busy={bulkBusy} onRun={(op) => void runBulk(op)} onCancel={() => setSelected(new Set())} />
      )}

      {editor && (
        <ProjectEditor
          key={editor.mode === "edit" ? editor.project.id : `new-${editor.category}`}
          target={editor}
          adminKey={adminKey}
          onClose={() => setEditor(null)}
          onSubmit={saveProject}
          onDelete={deleteProject}
          onDuplicate={duplicateProject}
          onError={toast.error}
          onInfo={toast.info}
        />
      )}
    </>
  );
}
