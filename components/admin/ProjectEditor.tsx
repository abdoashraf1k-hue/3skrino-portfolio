"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import ProjectBadges from "@/components/ui/ProjectBadges";
import PublicProjectCard from "@/components/ui/ProjectCard";
import { allCategories as categories } from "@/data/categories";
import type { Project } from "@/data/projects";
import { tools as knownTools } from "@/data/site";
import type { AnalyzeResponse } from "@/app/api/admin/analyze-video/route";
import { adminFetch } from "@/lib/admin/client-api";
import { formatDuration } from "@/lib/admin/video-upload";
import { AiChip } from "./ProjectCard";
import VideoUploader, { type ThumbSource } from "./VideoUploader";

export type EditorTarget = { mode: "new"; category: string; file?: File } | { mode: "edit"; project: Project };

type Props = {
  target: EditorTarget;
  adminKey: string;
  onClose: () => void;
  /** Persists the project (POST for new, PUT for edit). Throws on failure. */
  onSubmit: (project: Project) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
};

type Phase = "idle" | "saving" | "deleting" | "duplicating" | "analyzing";

type Form = {
  title: string;
  client: string;
  role: string;
  year: string;
  duration: string;
  orientation: "vertical" | "horizontal";
  category: string;
  tools: string[];
  tags: string[];
  accentColor: string;
  featured: boolean;
  filmed: boolean;
  directed: boolean;
  edited: boolean;
  description: string;
  videoUrl: string;
  thumbnail: string;
  thumbnailSource?: ThumbSource;
};

const DEFAULT_ACCENT = "#e7fe55";
const DURATION_RE = /^(?:\d{1,2}:)?[0-5]\d:[0-5]\d$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function initialForm(target: EditorTarget): Form {
  if (target.mode === "edit") {
    const p = target.project;
    return {
      title: p.title,
      client: p.client,
      role: p.role,
      year: String(p.year),
      duration: p.duration,
      orientation: p.orientation,
      category: p.category,
      tools: p.tools,
      tags: p.tags ?? [],
      accentColor: p.accentColor,
      featured: Boolean(p.featured),
      filmed: Boolean(p.filmed),
      directed: Boolean(p.directed),
      edited: p.edited !== false,
      description: p.description,
      videoUrl: p.videoUrl,
      thumbnail: p.thumbnail,
      thumbnailSource: p.thumbnailSource,
    };
  }
  return {
    title: target.file ? target.file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") : "",
    client: "",
    role: target.category === "ai" ? "AI Director, Editor" : "Editor",
    year: String(new Date().getFullYear()),
    duration: "",
    orientation: "vertical",
    category: target.category,
    tools: [],
    tags: [],
    accentColor: DEFAULT_ACCENT,
    featured: false,
    filmed: target.category !== "ai",
    directed: false,
    edited: true,
    description: "",
    videoUrl: "",
    thumbnail: "",
  };
}

/** Digits in → "M:SS" / "MM:SS" / "H:MM:SS" out, as you type. */
function maskDuration(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^0+(?=\d{5})/, "").slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, -2)}:${d.slice(-2)}`;
  return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

/** On blur: pad to MM:SS (or HH:MM:SS). */
function padDuration(value: string): string {
  if (!value) return value;
  const parts = value.split(":").map((p) => p.padStart(2, "0"));
  if (parts.length === 1) parts.unshift("00");
  return parts.join(":");
}

const inputCls =
  "w-full rounded-sm border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-[#e7fe55] focus-visible:outline-none";

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label
      className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-xs transition-colors ${
        checked ? "border-[#e7fe55]/60 bg-[#e7fe55]/[0.06] text-white" : "border-white/10 text-white/50 hover:border-white/25"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-3.5 accent-[#e7fe55]" />
      {children}
    </label>
  );
}

/** Chip input shared by tools and tags. */
function ChipInput({
  values,
  onChange,
  listId,
  suggestions,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  listId: string;
  suggestions?: readonly string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "");
    if (v && !values.some((t) => t.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div className={`${inputCls} flex flex-wrap items-center gap-1.5 focus-within:border-[#e7fe55]`}>
      {values.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-sm bg-white/10 px-2 py-0.5 text-xs">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(values.filter((x) => x !== t))} className="text-white/50 hover:text-white">
            ×
          </button>
        </span>
      ))}
      <input
        list={suggestions ? listId : undefined}
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v);
          else setDraft(v);
        }}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
        placeholder={values.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent py-0.5 outline-none placeholder:text-white/25"
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
    </div>
  );
}

export default function ProjectEditor({ target, adminKey, onClose, onSubmit, onDelete, onDuplicate, onError, onInfo }: Props) {
  const [form, setForm] = useState<Form>(() => initialForm(target));
  const [initial] = useState(() => JSON.stringify(initialForm(target)));
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const isEdit = target.mode === "edit";
  const busy = phase !== "idle";
  const dirty = JSON.stringify(form) !== initial || (target.mode === "new" && Boolean(target.file));
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const close = useCallback(() => {
    if (phase === "saving" || phase === "deleting" || phase === "duplicating") return;
    if (uploading && !window.confirm("An upload is still running. Discard it and close?")) return;
    if (!uploading && dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    onClose();
  }, [dirty, onClose, phase, uploading]);

  const validate = (): string | null => {
    if (!form.title.trim()) return "Title is required";
    const year = Number(form.year);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) return "Year must be between 1990 and 2100";
    if (!DURATION_RE.test(padDuration(form.duration))) return "Duration must be MM:SS or HH:MM:SS";
    if (!HEX_RE.test(form.accentColor)) return "Accent colour must be a hex value like #e7fe55";
    return null;
  };

  const toProject = (): Project => ({
    id: isEdit ? target.project.id : "",
    title: form.title.trim(),
    category: form.category,
    year: Number(form.year),
    client: form.client.trim(),
    role: form.role.trim(),
    tools: form.tools,
    duration: padDuration(form.duration) || "00:00",
    description: form.description.trim(),
    videoUrl: form.videoUrl,
    thumbnail: form.thumbnail,
    ...(form.thumbnail && form.thumbnailSource ? { thumbnailSource: form.thumbnailSource } : {}),
    featured: form.featured,
    filmed: form.filmed,
    directed: form.directed,
    edited: form.edited,
    ...(form.tags.length ? { tags: form.tags } : {}),
    ...(isEdit && target.project.createdAt ? { createdAt: target.project.createdAt } : {}),
    accentColor: HEX_RE.test(form.accentColor) ? form.accentColor.toLowerCase() : DEFAULT_ACCENT,
    orientation: form.orientation,
  });

  const save = async () => {
    if (busy) return;
    if (uploading) return onError("Wait for the upload to finish before saving");
    const problem = validate();
    if (problem) return onError(problem);
    setPhase("saving");
    try {
      await onSubmit(toProject());
    } catch (err) {
      setPhase("idle");
      onError(err instanceof Error ? err.message : "Save failed");
    }
  };
  // Keyboard handlers read the latest closure.
  const saveRef = useRef(save);
  const closeRef = useRef(close);
  useEffect(() => {
    saveRef.current = save;
    closeRef.current = close;
  });

  // Ctrl/Cmd+S saves, Escape closes — wherever focus is.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Closing the tab with edits pending gets the browser's own prompt.
  useEffect(() => {
    if (!dirty && !uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading]);

  const remove = async () => {
    if (!isEdit) return;
    if (!window.confirm(`Delete "${target.project.title}"? This commits to GitHub and redeploys the site.`)) return;
    setPhase("deleting");
    try {
      await onDelete(target.project.id);
    } catch (err) {
      setPhase("idle");
      onError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const duplicate = async () => {
    if (!isEdit) return;
    if (dirty && !window.confirm("Duplicate the saved version? Your unsaved changes here will be discarded.")) return;
    setPhase("duplicating");
    try {
      await onDuplicate(target.project.id);
    } catch (err) {
      setPhase("idle");
      onError(err instanceof Error ? err.message : "Duplicate failed");
    }
  };

  const analyze = async () => {
    if (!form.title.trim() && !form.description.trim()) return onError("Add a title or description first");
    setPhase("analyzing");
    try {
      const res = await adminFetch<AnalyzeResponse>(adminKey, "analyze-video", "POST", {
        title: form.title,
        description: form.description,
        client: form.client,
        role: form.role,
        tools: form.tools,
      });
      const s = res.suggestion;
      setForm((f) => ({
        ...f,
        category: s.category,
        tags: [...new Set([...f.tags, ...s.tags])].slice(0, 12),
        accentColor: s.accentColor,
        filmed: s.filmed,
        directed: s.directed,
        edited: s.edited,
      }));
      onInfo(res.source === "ai" ? "✨ AI suggestions applied — review before saving" : (res.note ?? "Suggestions applied"));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setPhase("idle");
    }
  };

  const onVideo = useCallback(
    ({ videoUrl, duration }: { videoUrl: string; duration: number }) =>
      setForm((f) => ({ ...f, videoUrl, duration: f.duration || (duration > 0 ? formatDuration(duration) : f.duration) })),
    [],
  );
  const onThumbnail = useCallback(
    (thumbnail: string, source?: ThumbSource) => setForm((f) => ({ ...f, thumbnail, thumbnailSource: thumbnail ? source : undefined })),
    [],
  );

  const draft = toProject();
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? `Edit ${target.project.title}` : "New project"}
      data-lenis-prevent
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="admin-fade fixed inset-0 z-[150] flex items-stretch justify-center overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm sm:items-start sm:p-6 md:p-10"
    >
      {/* Clip reveal (bottom → top): the panel unveils upward into place. */}
      <div className="admin-clip-reveal-up relative flex min-h-full w-full max-w-4xl flex-col border-white/10 bg-[#0a0a0a] sm:min-h-0 sm:border">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black uppercase tracking-tight">{isEdit ? "Edit project" : "New project"}</h2>
            {form.category === "ai" && <AiChip />}
            {dirty && <span className="font-mono text-[9px] uppercase tracking-widest text-[#e7fe55]">● unsaved</span>}
          </div>
          <div className="flex items-center gap-3">
            <div role="tablist" className="flex border border-white/10">
              {(["edit", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest ${
                    tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button type="button" onClick={close} aria-label="Close" className="px-2 text-xl leading-none text-white/50 hover:text-white">
              ×
            </button>
          </div>
        </header>

        {/* Edit stays mounted under Preview so an upload in progress keeps running. */}
        <div className={tab === "edit" ? "grid flex-1 gap-6 p-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "hidden"}>
          <VideoUploader
            adminKey={adminKey}
            videoUrl={form.videoUrl}
            thumbnail={form.thumbnail}
            thumbnailSource={form.thumbnailSource}
            orientation={form.orientation}
            initialFile={target.mode === "new" ? target.file : undefined}
            disabled={busy}
            onVideo={onVideo}
            onThumbnail={onThumbnail}
            onBusyChange={setUploading}
            onError={onError}
          />

          <fieldset disabled={busy && phase !== "analyzing"} className="grid grid-cols-2 content-start gap-4 disabled:opacity-60">
            <Field label="Title" className="col-span-2">
              <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
            </Field>
            <Field label="Client">
              <input className={inputCls} value={form.client} onChange={(e) => set("client", e.target.value)} />
            </Field>
            <Field label="Role">
              <input className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)} />
            </Field>
            <Field label="Year">
              <input
                type="number"
                inputMode="numeric"
                min={1990}
                max={2100}
                className={inputCls}
                value={form.year}
                onChange={(e) => set("year", e.target.value)}
              />
            </Field>
            <Field label="Duration">
              <input
                inputMode="numeric"
                placeholder={uploading ? "auto" : "MM:SS"}
                className={`${inputCls} font-mono tabular-nums`}
                value={form.duration}
                onChange={(e) => set("duration", maskDuration(e.target.value))}
                onBlur={() => set("duration", padDuration(form.duration))}
              />
            </Field>
            <Field label="Category">
              <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#141414]">
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Orientation</span>
              <div role="radiogroup" className="flex gap-2">
                {(["vertical", "horizontal"] as const).map((o) => (
                  <label
                    key={o}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-sm border px-2 py-2 font-mono text-[10px] uppercase tracking-widest ${
                      form.orientation === o ? "border-[#e7fe55] text-[#e7fe55]" : "border-white/10 text-white/50"
                    }`}
                  >
                    <input type="radio" name="orientation" value={o} checked={form.orientation === o} onChange={() => set("orientation", o)} className="sr-only" />
                    {o === "vertical" ? "9:16" : "16:9"}
                    <span className="hidden sm:inline">{o}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Credits</span>
              <div className="flex flex-wrap gap-2">
                <Check checked={form.filmed} onChange={(v) => set("filmed", v)}>
                  🎬 I filmed this
                </Check>
                <Check checked={form.directed} onChange={(v) => set("directed", v)}>
                  🎥 I directed this
                </Check>
                <Check checked={form.edited} onChange={(v) => set("edited", v)}>
                  ✂️ I edited this
                </Check>
              </div>
            </div>

            <Field label="Tools" className="col-span-2">
              <ChipInput values={form.tools} onChange={(v) => set("tools", v)} listId="admin-tools" suggestions={knownTools} placeholder="Type + Enter" />
            </Field>

            <div className="col-span-2 flex flex-col gap-1.5">
              <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-white/40">
                Tags
                <button
                  type="button"
                  onClick={() => void analyze()}
                  disabled={phase === "analyzing"}
                  className="flex items-center gap-1.5 rounded-full border border-[#9b8cff]/40 bg-[#9b8cff]/10 px-2.5 py-1 text-[#c9bfff] hover:border-[#9b8cff] disabled:animate-pulse"
                >
                  ✨ {phase === "analyzing" ? "Analyzing…" : "Analyze with AI"}
                </button>
              </span>
              <ChipInput values={form.tags} onChange={(v) => set("tags", v)} listId="admin-tags" placeholder="Keywords for search" />
            </div>

            <Field label="Accent colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX_RE.test(form.accentColor) ? form.accentColor : DEFAULT_ACCENT}
                  onChange={(e) => set("accentColor", e.target.value)}
                  className="h-9 w-10 shrink-0 cursor-pointer rounded-sm border border-white/10 bg-transparent p-0.5"
                  aria-label="Accent colour picker"
                />
                <input
                  className={`${inputCls} font-mono`}
                  value={form.accentColor}
                  maxLength={7}
                  onChange={(e) => set("accentColor", e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
                />
              </div>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Featured</span>
              <button type="button" role="switch" aria-checked={form.featured} onClick={() => set("featured", !form.featured)} className="flex h-9 items-center gap-3">
                <span className={`relative h-5 w-9 rounded-full transition-colors ${form.featured ? "bg-[#e7fe55]" : "bg-white/15"}`}>
                  <span className={`absolute top-0.5 size-4 rounded-full bg-[#0a0a0a] transition-[left] ${form.featured ? "left-[18px]" : "left-0.5"}`} />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/60">{form.featured ? "On home" : "Off"}</span>
              </button>
            </div>

            <Field label="Description" className="col-span-2">
              <textarea rows={4} className={`${inputCls} resize-y`} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </fieldset>
        </div>

        {tab === "preview" && (
          <div className="flex flex-1 flex-col items-center gap-6 bg-[#050505] p-6 md:p-10">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">Live preview — how the card renders on the site (hover it)</p>
            {/* The real public card, fed the unsaved form. Clicks are swallowed so it can't navigate. */}
            <div
              onClickCapture={(e) => e.preventDefault()}
              className={`bg-bg font-sans text-fg ${form.orientation === "vertical" ? "w-[min(280px,70vw)]" : "w-full max-w-2xl"}`}
            >
              <PublicProjectCard project={{ ...draft, id: draft.id || "preview" }} index={0} size={form.orientation === "horizontal" ? "lg" : "md"} />
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Detail page credits</span>
              <ProjectBadges filmed={form.filmed} directed={form.directed} edited={form.edited} size="md" long />
            </div>
          </div>
        )}

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-[#0a0a0a] px-5 py-4">
          <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-white/40">
            {uploading && "Uploading… "}
            {phase === "saving" && "Committing to GitHub…"}
            {phase === "deleting" && "Deleting…"}
            {phase === "duplicating" && "Duplicating…"}
            {phase === "idle" && !uploading && (
              <>
                <kbd className="rounded border border-white/15 px-1">{mod} S</kbd> save · <kbd className="rounded border border-white/15 px-1">Esc</kbd> close
              </>
            )}
          </span>
          <button
            type="button"
            onClick={close}
            disabled={phase === "saving" || phase === "deleting"}
            className="px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
          {isEdit && (
            <>
              <button
                type="button"
                onClick={() => void duplicate()}
                disabled={busy || uploading}
                className="border border-white/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-white/70 hover:border-white/40 disabled:opacity-40"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="border border-[#ff2d2d]/50 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-[#ff5a5a] hover:bg-[#ff2d2d]/10 disabled:opacity-40"
              >
                Delete
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || uploading}
            className="bg-[#e7fe55] px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0a0a0a] hover:bg-[#f0ff8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e7fe55] disabled:opacity-50"
          >
            {phase === "saving" ? "Saving…" : uploading ? "Uploading…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
