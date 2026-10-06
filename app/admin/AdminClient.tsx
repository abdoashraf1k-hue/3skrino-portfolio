"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StatsResponse } from "@/app/api/admin/stats/route";
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
import PreviewDock from "@/components/admin/PreviewDock";
import ProjectEditor, { type EditorTarget } from "@/components/admin/ProjectEditor";
import { ToastProvider, useToast } from "@/components/admin/Toast";
import { btn, btnPrimary, micro, SaveBar } from "@/components/admin/ui";
import ProjectCardPreview from "@/components/ui/ProjectCard";
import { allCategories as categories } from "@/data/categories";
import type { Project } from "@/data/projects";
import { AuthError, adminFetch, clearStoredKey, readStoredKey, storeKey, type ProjectsResponse } from "@/lib/admin/client-api";
import { assertUploadable } from "@/lib/admin/video-upload";
import { dirtyIn, getIn, pairOf, setIn, TAB_SLICES } from "./slices";
import { ConfigProvider, useConfigStore } from "./store";
import ActivityTab from "./tabs/ActivityTab";
import AnalyticsTab from "./tabs/AnalyticsTab";
import BackupsTab from "./tabs/BackupsTab";
import BrandsTab from "./tabs/BrandsTab";
import BulkTab from "./tabs/BulkTab";
import ComponentsTab from "./tabs/ComponentsTab";
import ContentTab from "./tabs/ContentTab";
import CursorTab from "./tabs/CursorTab";
import DangerTab from "./tabs/DangerTab";
import DashboardTab from "./tabs/DashboardTab";
import EffectsTab from "./tabs/EffectsTab";
import ExperimentsTab from "./tabs/ExperimentsTab";
import HeroesTab from "./tabs/HeroesTab";
import HeroTab from "./tabs/HeroTab";
import ImportExportTab from "./tabs/ImportExportTab";
import IntegrationsTab from "./tabs/IntegrationsTab";
import LayoutTab from "./tabs/LayoutTab";
import LogsTab from "./tabs/LogsTab";
import MediaTab from "./tabs/MediaTab";
import MotionTab from "./tabs/MotionTab";
import RolesTab from "./tabs/RolesTab";
import SectionsTab from "./tabs/SectionsTab";
import SeoTab from "./tabs/SeoTab";
import SettingsTab from "./tabs/SettingsTab";
import SocialTab from "./tabs/SocialTab";
import SoundTab from "./tabs/SoundTab";
import TagsTab from "./tabs/TagsTab";
import ThemeTab from "./tabs/ThemeTab";
import ThumbnailsTab from "./tabs/ThumbnailsTab";
import TypographyTab from "./tabs/TypographyTab";
import BrandTab from "./tabs/BrandTab";
import CategoriesTab from "./tabs/CategoriesTab";
import IconsTab from "./tabs/IconsTab";
import InterviewTab from "./tabs/InterviewTab";
import NumbersTab from "./tabs/NumbersTab";
import TextTab from "./tabs/TextTab";

const POLL_MS = 30_000;
const TICK_MS = 15_000;

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; message: string };
type WithProject = ProjectsResponse & { project: Project };

/**
 * The control center's tabs, grouped in the sidebar. Ids are URL-stable
 * (?tab=hero is still the poses tab, now labelled "Poses").
 */
const NAV = [
  {
    group: "Overview",
    tabs: [
      { id: "dashboard", label: "Dashboard", icon: "◧" },
      { id: "analytics", label: "Analytics", icon: "◔" },
      { id: "logs", label: "Logs", icon: "≡" },
      { id: "activity", label: "Activity", icon: "⋮" },
    ],
  },
  {
    group: "Content",
    tabs: [
      { id: "projects", label: "Projects", icon: "▦" },
      { id: "media", label: "Media Library", icon: "▣" },
      { id: "categories", label: "Categories", icon: "▧" },
      { id: "tags", label: "Tags", icon: "#" },
      { id: "thumbnails", label: "Thumbnails", icon: "▢" },
      { id: "bulk", label: "Bulk", icon: "☰" },
      { id: "import", label: "Import / Export", icon: "⇅" },
    ],
  },
  {
    group: "Heroes",
    tabs: [
      { id: "heroes", label: "Heroes", icon: "◎" },
      { id: "hero", label: "Poses", icon: "◉" },
      { id: "brands", label: "Brands", icon: "✦" },
      { id: "roles", label: "Roles", icon: "↻" },
      { id: "interview", label: "Interview", icon: "◙" },
      { id: "effects", label: "Effects", icon: "✺" },
    ],
  },
  {
    group: "Design",
    tabs: [
      { id: "brand", label: "Brand", icon: "◈" },
      { id: "layout", label: "Layout", icon: "▤" },
      { id: "theme", label: "Theme", icon: "◐" },
      { id: "typography", label: "Typography", icon: "Aa" },
      { id: "components", label: "Components", icon: "◫" },
      { id: "icons", label: "Icons", icon: "✧" },
    ],
  },
  {
    group: "Site",
    tabs: [
      { id: "sections", label: "Sections", icon: "▥" },
      { id: "content", label: "Content", icon: "¶" },
      { id: "text", label: "Text", icon: "T" },
      { id: "numbers", label: "Numbers", icon: "№" },
      { id: "seo", label: "SEO", icon: "⌕" },
      { id: "social", label: "Social", icon: "@" },
    ],
  },
  {
    group: "Creative",
    tabs: [
      { id: "cursor", label: "Cursor Studio", icon: "⌖" },
      { id: "sound", label: "Sound Studio", icon: "♪" },
      { id: "motion", label: "Motion Lab", icon: "∿" },
      { id: "experiments", label: "Experiment Lab", icon: "⚗" },
    ],
  },
  {
    group: "System",
    tabs: [
      { id: "backups", label: "Backups", icon: "⟲" },
      { id: "settings", label: "Settings", icon: "⚙" },
      { id: "integrations", label: "Integrations", icon: "⌁" },
      { id: "danger", label: "Danger Zone", icon: "⚠" },
    ],
  },
] as const;
type Tab = (typeof NAV)[number]["tabs"][number]["id"];
const TABS: readonly Tab[] = NAV.flatMap((g) => g.tabs.map((t) => t.id));
/** Tabs that edit the configs the live preview renders — the dock follows them to the home page. */
const HOME_PREVIEW_TABS = new Set<Tab>([
  "hero",
  "interview",
  "brand",
  "categories",
  "text",
  "numbers",
  "icons",
  "brands",
  "roles",
  "layout",
  "heroes",
  "effects",
  "experiments",
  "cursor",
  "sound",
  "motion",
  "sections",
  "typography",
  "components",
]);
/** Tabs that work without the two config files loaded. */
const NO_CONFIG_TABS = new Set<Tab>(["dashboard", "projects", "analytics", "logs", "settings", "activity", "media", "tags", "thumbnails", "bulk", "integrations"]);

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
  const [adminKey] = useState(readKey);

  const deny = useCallback(() => {
    clearStoredKey();
    setStatus({ kind: "denied" });
  }, []);

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
    <ConfigProvider adminKey={adminKey} onAuthError={deny} onError={toast.error} onSuccess={toast.success}>
      <Shell initialParams={initialParams} adminKey={adminKey} status={status} setStatus={setStatus} deny={deny} />
    </ConfigProvider>
  );
}

type ShellProps = {
  initialParams: Record<string, string>;
  adminKey: string;
  status: Status;
  setStatus: (s: Status) => void;
  deny: () => void;
};

function Shell({ initialParams, adminKey, status, setStatus, deny }: ShellProps) {
  const toast = useToast();
  const config = useConfigStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(new URLSearchParams(initialParams)));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => t === initialParams.tab) ?? "dashboard");
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  /** Videos picked via "Bulk upload" — the editor opens for each in turn. */
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [navOpen, setNavOpen] = useState(false);

  const keyRef = useRef(adminKey);
  const searchRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const booted = useRef(false);
  const inFlightWrites = useRef(0);
  const writeGen = useRef(0); // bumps on every write so stale polls are discarded
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const filtering = isFiltering(filters);
  const visible = useFilteredProjects(projects, filters);
  const years = useMemo(() => [...new Set(projects.map((p) => p.year))].sort((a, b) => b - a), [projects]);
  const dirtyNames = [...config.dirty.hero, ...config.dirty.site, ...config.dirty.brand];

  const applyServer = useCallback((res: ProjectsResponse) => {
    setProjects(res.projects);
    setSyncedAt(Date.now());
    setNow(Date.now());
    setSelected((sel) => {
      const ids = new Set(res.projects.map((p) => p.id));
      const next = new Set([...sel].filter((id) => ids.has(id)));
      return next.size === sel.size ? sel : next;
    });
  }, []);

  /** GET the projects file from GitHub. Skipped while a write is in flight. */
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
    [applyServer, deny, setStatus],
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

  const switchTab = useCallback((next: Tab) => {
    setTab(next);
    setNavOpen(false);
    const url = new URL(window.location.href);
    if (next === "dashboard") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0 });
  }, []);

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
    switchTab("projects");
    setEditor({ mode: "new", category: filters.cat || categories[0].id });
  }, [filters.cat, switchTab]);

  // Bulk upload: open the editor for the next queued video whenever it's free.
  useEffect(() => {
    if (editor || !uploadQueue.length) return;
    const id = requestAnimationFrame(() => {
      const [file, ...rest] = uploadQueue;
      setUploadQueue(rest);
      setEditor({ mode: "new", category: filters.cat || categories[0].id, file });
    });
    return () => cancelAnimationFrame(id);
  }, [editor, uploadQueue, filters.cat]);

  const startBulkUpload = useCallback(() => {
    switchTab("projects");
    requestAnimationFrame(() => bulkInputRef.current?.click());
  }, [switchTab]);

  // Shortcuts: Ctrl/⌘+S saves config drafts (the project editor owns it while open) ·
  // projects tab: Ctrl/⌘+K search · N new project · Esc clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s" && !editor) {
        if (config.dirty.hero.length + config.dirty.site.length + config.dirty.brand.length) {
          e.preventDefault();
          void config.saveAll();
        }
        return;
      }
      if (editor || status.kind !== "ready") return;
      if (tab === "bulk" && k === "escape" && selected.size && !isTyping(e.target)) {
        setSelected(new Set());
        return;
      }
      if (tab !== "projects") return;
      if (mod && k === "k") {
        e.preventDefault();
        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        });
      } else if ((mod && k === "n") || (k === "n" && !e.altKey && !mod && !isTyping(e.target))) {
        e.preventDefault();
        newProject();
      } else if (k === "escape" && selected.size && !isTyping(e.target)) {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config, editor, newProject, selected.size, status.kind, tab]);

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

  /** Inline ✎ edit: title / year without opening the editor. */
  const quickEdit = async (id: string, patch: { title: string; year: number }) => {
    try {
      const res = await withAuth(runWrite(() => adminFetch<ProjectsResponse>(keyRef.current, "projects", "PUT", { id, patch })));
      applyServer(res);
      toast.success("Updated — deploying…");
    } catch (err) {
      if (!(err instanceof AuthError)) toast.error(err instanceof Error ? err.message : "Update failed");
      throw err;
    }
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
        !set.has(p.id) ? p : op.action === "category" ? { ...p, category: op.category } : { ...p, featured: op.action === "feature" },
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

  const backupNow = async () => {
    try {
      const r = await withAuth(adminFetch<{ files: number }>(keyRef.current, "backups", "POST", { action: "snapshot" }));
      toast.success(`Backed up ${r.files} files`);
    } catch (err) {
      if (!(err instanceof AuthError)) toast.error(err instanceof Error ? err.message : "Backup failed");
    }
  };

  /** admin → Tags: rename / merge / remove a tag across projects (one commit). */
  const retag = async (from: string, to: string, ids: string[]) => {
    try {
      const res = await withAuth(runWrite(() => adminFetch<ProjectsResponse>(keyRef.current, "bulk", "POST", { action: "retag", ids, from, to })));
      applyServer(res);
      toast.success(to ? `#${from} → #${to} on ${ids.length} project${ids.length === 1 ? "" : "s"} — deploying…` : `#${from} removed — deploying…`);
    } catch (err) {
      if (!(err instanceof AuthError)) toast.error(err instanceof Error ? err.message : "Tag update failed");
    }
  };

  /** The per-tab save bar's "Discard tab": put only this tab's slices back to what's saved. */
  const discardTab = () => {
    for (const sl of TAB_SLICES[tab] ?? []) {
      const [saved] = pairOf(sl.file, config);
      if (sl.file === "hero") config.setHero((c) => setIn(c, sl.path, getIn(saved, sl.path)));
      else if (sl.file === "site") config.setSite((c) => setIn(c, sl.path, getIn(saved, sl.path)));
      else config.setBrand((c) => setIn(c, sl.path, getIn(saved, sl.path)));
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

  const reloadAll = () => {
    void refresh();
    void config.reload();
  };

  const configReady = config.status.kind === "ready";
  const needsConfig = !NO_CONFIG_TABS.has(tab);
  // Which tabs have unsaved edits (sidebar dots + save bar) — recomputed only when a config changes.
  const dirtyByTab = useMemo(() => {
    const pair = {
      hero: config.hero,
      site: config.site,
      brand: config.brand,
      savedHero: config.savedHero,
      savedSite: config.savedSite,
      savedBrand: config.savedBrand,
    };
    return new Map(TABS.map((t) => [t, dirtyIn(t, pair)]));
  }, [config.hero, config.site, config.brand, config.savedHero, config.savedSite, config.savedBrand]);
  const tabDirty = dirtyByTab.get(tab) ?? [];

  let body: ReactNode;
  if (needsConfig && !configReady) {
    body =
      config.status.kind === "error" ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <p className="max-w-md text-sm text-[#ff5a5a]">{config.status.message}</p>
          <button type="button" className={btn} onClick={() => void config.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <p className={`${micro} py-24 text-center text-white/40`}>Loading settings from GitHub…</p>
      );
  } else if (tab === "dashboard") {
    body = (
      <DashboardTab
        adminKey={adminKey}
        projects={projects}
        stats={stats}
        now={now}
        onAuthError={deny}
        onNewProject={newProject}
        onBulkUpload={startBulkUpload}
        onBackupNow={backupNow}
        onOpenLogs={() => switchTab("logs")}
      />
    );
  } else if (tab === "analytics") {
    body = <AnalyticsTab adminKey={adminKey} projects={projects} onAuthError={deny} />;
  } else if (tab === "logs") {
    body = <LogsTab adminKey={adminKey} onAuthError={deny} onError={toast.error} onSuccess={toast.success} onChanged={reloadAll} />;
  } else if (tab === "content") {
    body = <ContentTab adminKey={adminKey} onError={toast.error} />;
  } else if (tab === "seo") {
    body = <SeoTab projects={projects} />;
  } else if (tab === "hero") {
    body = <HeroTab adminKey={adminKey} onError={toast.error} onSuccess={toast.success} />;
  } else if (tab === "brands") {
    body = <BrandsTab adminKey={adminKey} onError={toast.error} />;
  } else if (tab === "roles") {
    body = <RolesTab />;
  } else if (tab === "layout") {
    body = <LayoutTab />;
  } else if (tab === "theme") {
    body = <ThemeTab />;
  } else if (tab === "backups") {
    body = <BackupsTab adminKey={adminKey} onRestoredProjects={applyServer} onAuthError={deny} onError={toast.error} onSuccess={toast.success} />;
  } else if (tab === "settings") {
    body = <SettingsTab adminKey={adminKey} onAuthError={deny} onError={toast.error} onSuccess={toast.success} />;
  } else if (tab === "activity") {
    body = <ActivityTab adminKey={adminKey} onAuthError={deny} />;
  } else if (tab === "media") {
    body = <MediaTab adminKey={adminKey} projects={projects} onAuthError={deny} onError={toast.error} onSuccess={toast.success} />;
  } else if (tab === "tags") {
    body = <TagsTab projects={projects} onRetag={retag} />;
  } else if (tab === "thumbnails") {
    body = <ThumbnailsTab projects={projects} onEdit={(project) => setEditor({ mode: "edit", project })} />;
  } else if (tab === "bulk") {
    body = <BulkTab projects={projects} selected={selected} onToggle={toggleSelect} onSelectAll={selectAll} />;
  } else if (tab === "import") {
    body = <ImportExportTab projects={projects} />;
  } else if (tab === "heroes") {
    body = <HeroesTab projects={projects} />;
  } else if (tab === "effects") {
    body = <EffectsTab projects={projects} />;
  } else if (tab === "typography") {
    body = <TypographyTab />;
  } else if (tab === "components") {
    body = <ComponentsTab />;
  } else if (tab === "sections") {
    body = <SectionsTab />;
  } else if (tab === "social") {
    body = <SocialTab />;
  } else if (tab === "integrations") {
    body = <IntegrationsTab adminKey={adminKey} onAuthError={deny} />;
  } else if (tab === "danger") {
    body = <DangerTab onBackupNow={backupNow} onOpenSettings={() => switchTab("settings")} onSuccess={toast.success} />;
  } else if (tab === "cursor") {
    body = <CursorTab />;
  } else if (tab === "sound") {
    body = <SoundTab adminKey={adminKey} onError={toast.error} onSuccess={toast.success} />;
  } else if (tab === "motion") {
    body = <MotionTab />;
  } else if (tab === "experiments") {
    body = <ExperimentsTab />;
  } else if (tab === "brand") {
    body = <BrandTab adminKey={adminKey} onError={toast.error} onSuccess={toast.success} />;
  } else if (tab === "categories") {
    body = <CategoriesTab projects={projects} />;
  } else if (tab === "text") {
    body = <TextTab />;
  } else if (tab === "numbers") {
    body = <NumbersTab />;
  } else if (tab === "icons") {
    body = <IconsTab adminKey={adminKey} onError={toast.error} />;
  } else if (tab === "interview") {
    body = <InterviewTab />;
  } else {
    body = (
      <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Projects</h1>
            <p className={`${micro} mt-1 text-white/40`}>
              drop a video on a category · drag rows to reorder or into another category · ✎ quick edit · N new · Ctrl K search
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={startBulkUpload} className={btn}>
              Bulk upload
            </button>
            <button type="button" onClick={newProject} className={btnPrimary}>
              + New project
            </button>
          </div>
        </div>

        {status.kind === "ready" && <AdminDashboard projects={projects} stats={stats} syncedAt={syncedAt} now={now} />}
        {status.kind === "ready" && (
          <AdminFilters value={filters} onChange={setFilters} years={years} resultCount={visible.length} total={projects.length} searchRef={searchRef} />
        )}
        {status.kind === "loading" && <p className={`${micro} py-24 text-center text-white/40`}>Loading from GitHub…</p>}
        {status.kind === "error" && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="max-w-md text-sm text-[#ff5a5a]">{status.message}</p>
            <button type="button" onClick={() => void refresh(true)} className={btn}>
              Retry
            </button>
          </div>
        )}
        {status.kind === "ready" && (
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
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
              onQuickEdit={quickEdit}
              onPreview={setPreviewProject}
            />
            {/* Live card preview: the real site card for the row under the pointer / focus. */}
            <aside className="hidden 2xl:block">
              <div className="sticky top-24">
                <p className={`${micro} mb-2 text-white/40`}>Card preview {previewProject ? "· hover it" : "· hover a row"}</p>
                {previewProject ? (
                  <div className="pointer-events-auto" style={{ aspectRatio: previewProject.orientation === "vertical" ? "9 / 16" : "16 / 9" }}>
                    <ProjectCardPreview project={previewProject} index={Math.max(0, projects.findIndex((p) => p.id === previewProject.id))} aspect={previewProject.orientation === "vertical" ? "tall" : "wide"} />
                  </div>
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center border border-dashed border-white/10">
                    <span className={`${micro} text-white/25`}>No project</span>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <input
        ref={bulkInputRef}
        type="file"
        accept="video/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          const ok: File[] = [];
          for (const f of files) {
            try {
              assertUploadable(f);
              ok.push(f);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : `${f.name} can't be uploaded`);
            }
          }
          if (ok.length) {
            setUploadQueue((q) => [...q, ...ok]);
            toast.info(`${ok.length} video${ok.length === 1 ? "" : "s"} queued — the editor opens for each`);
          }
        }}
      />

      {/* Header: brand · unsaved-changes bar · sync · site · logout. Sticks while the page scrolls. */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <button type="button" className={`${btn} lg:hidden`} onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen} aria-controls="admin-nav">
            ☰
          </button>
          <p className="shrink-0 text-sm font-black uppercase tracking-widest">
            3SKRINO <span className="text-white/30">—</span> <span className="text-[#e7fe55]">Control</span>
          </p>

          <div className="ml-auto flex min-w-0 items-center gap-2 md:gap-3">
            {dirtyNames.length > 0 && (
              <div className="admin-fade flex min-w-0 items-center gap-2 border border-[#e7fe55]/30 bg-[#e7fe55]/[0.06] py-1 pl-3 pr-1">
                <span className={`${micro} hidden min-w-0 truncate text-[#e7fe55] sm:inline`} title={dirtyNames.join(", ")}>
                  ● Unsaved: {dirtyNames.join(", ")}
                </span>
                <span className={`${micro} text-[#e7fe55] sm:hidden`}>● {dirtyNames.length}</span>
                <button type="button" className={`${btn} h-7 px-2`} disabled={config.saving} onClick={config.discard}>
                  Discard
                </button>
                <button type="button" className={`${btnPrimary} h-7 px-3 py-0`} disabled={config.saving} onClick={() => void config.saveAll()}>
                  {config.saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                void refresh();
                void refreshStats();
              }}
              title="Refresh now"
              className={`${micro} hidden items-center gap-2 text-white/50 hover:text-white md:flex`}
            >
              <span className={`size-1.5 rounded-full ${status.kind === "ready" ? "bg-[#e7fe55]" : status.kind === "error" ? "bg-[#ff2d2d]" : "bg-white/30"}`} />
              <span className="hidden xl:inline">
                {syncedAt === null ? "Connecting…" : now - syncedAt < 60_000 ? "Synced just now" : `Synced ${Math.floor((now - syncedAt) / 60_000)}m ago`}
              </span>
            </button>
            <a href="/" target="_blank" rel="noreferrer" className={`${micro} hidden text-white/50 hover:text-white md:inline`}>
              Site ↗
            </a>
            <button type="button" onClick={logout} className={`${btn} h-8`}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar: grouped tabs. A drawer under lg. */}
        <nav
          id="admin-nav"
          aria-label="Admin sections"
          className={`${navOpen ? "fixed inset-x-0 top-14 bottom-0 z-[35] block overflow-y-auto bg-[#0a0a0a]" : "hidden"} w-full shrink-0 border-r border-white/10 lg:sticky lg:top-14 lg:block lg:h-[calc(100vh-3.5rem)] lg:w-56 lg:overflow-y-auto`}
        >
          <div className="flex flex-col gap-4 px-3 py-5">
            {NAV.map((g) => (
              <div key={g.group}>
                <p className={`${micro} mb-1.5 px-2 text-[9px] text-white/30`}>{g.group}</p>
                <ul className="flex flex-col">
                  {g.tabs.map((t) => {
                    const on = tab === t.id;
                    const dirtyHere = (dirtyByTab.get(t.id)?.length ?? 0) > 0;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => switchTab(t.id)}
                          aria-current={on ? "page" : undefined}
                          className={`flex w-full items-center gap-2.5 px-2 py-1.5 text-left font-mono text-[11px] uppercase tracking-widest transition-colors ${
                            on ? "bg-[#e7fe55]/[0.08] text-[#e7fe55]" : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          <span aria-hidden className="w-4 text-center text-[12px]">
                            {t.icon}
                          </span>
                          {t.label}
                          {dirtyHere && <span aria-label="unsaved" className="ml-auto size-1.5 rounded-full bg-[#e7fe55]" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1 px-4 py-8 pb-32 md:px-8">
          <div className="mx-auto max-w-[1500px]">
            {body}
            {configReady && <SaveBar names={tabDirty} saving={config.saving} onDiscard={discardTab} onSave={() => void config.saveAll()} />}
          </div>
        </main>
      </div>

      {selected.size > 0 && (tab === "projects" || tab === "bulk") && (
        <BulkBar count={selected.size} busy={bulkBusy} onRun={(op) => void runBulk(op)} onCancel={() => setSelected(new Set())} />
      )}

      <PreviewDock
        hero={config.hero}
        site={config.site}
        brand={config.brand}
        dirty={dirtyNames.length > 0}
        focusPath={HOME_PREVIEW_TABS.has(tab) ? "/" : undefined}
      />

      {editor && (
        <ProjectEditor
          key={editor.mode === "edit" ? editor.project.id : `new-${editor.category}-${editor.file?.name ?? ""}`}
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
