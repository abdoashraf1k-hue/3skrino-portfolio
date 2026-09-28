"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { categories } from "@/data/categories";
import type { Project } from "@/data/projects";
import { tools as knownTools } from "@/data/site";
import { formatDuration, posterFor, uploadToCloudinary } from "@/lib/admin/cloudinary";
import { AiChip } from "./ProjectCard";
import VideoUploader from "./VideoUploader";

export type EditorTarget = { mode: "new"; category: string; file?: File } | { mode: "edit"; project: Project };

type Props = {
  target: EditorTarget;
  onClose: () => void;
  /** Persists the project (POST for new, PUT for edit). Throws on failure. */
  onSubmit: (project: Project) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onError: (message: string) => void;
};

type Phase = "idle" | "uploading" | "saving" | "deleting";
type Pending = { file: File; url: string };

type Form = {
  title: string;
  client: string;
  role: string;
  year: string;
  duration: string;
  orientation: "vertical" | "horizontal";
  category: string;
  tools: string[];
  accentColor: string;
  featured: boolean;
  description: string;
  videoUrl: string;
  thumbnail: string;
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
      accentColor: p.accentColor,
      featured: Boolean(p.featured),
      description: p.description,
      videoUrl: p.videoUrl,
      thumbnail: p.thumbnail,
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
    accentColor: DEFAULT_ACCENT,
    featured: false,
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

export default function ProjectEditor({ target, onClose, onSubmit, onDelete, onError }: Props) {
  const [form, setForm] = useState<Form>(() => initialForm(target));
  const [pending, setPending] = useState<Pending | null>(() =>
    target.mode === "new" && target.file ? { file: target.file, url: URL.createObjectURL(target.file) } : null,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [toolDraft, setToolDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const isEdit = target.mode === "edit";
  const busy = phase !== "idle";
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const replacePending = (next: Pending | null) => {
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return next;
    });
  };

  const close = () => {
    if (phase === "saving" || phase === "deleting") return;
    if (phase === "uploading" && !window.confirm("An upload is in progress. Discard it and close?")) return;
    abortRef.current?.abort();
    replacePending(null);
    onClose();
  };

  const addTool = (raw: string) => {
    const tool = raw.trim().replace(/,$/, "");
    if (tool && !form.tools.some((t) => t.toLowerCase() === tool.toLowerCase())) set("tools", [...form.tools, tool]);
    setToolDraft("");
  };

  const onToolKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTool(toolDraft);
    } else if (e.key === "Backspace" && !toolDraft && form.tools.length) {
      set("tools", form.tools.slice(0, -1));
    }
  };

  const validate = (): string | null => {
    if (!form.title.trim()) return "Title is required";
    const year = Number(form.year);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) return "Year must be between 1990 and 2100";
    if (!DURATION_RE.test(padDuration(form.duration)) && !(pending && !form.duration)) {
      return "Duration must be MM:SS or HH:MM:SS";
    }
    if (!HEX_RE.test(form.accentColor)) return "Accent colour must be a hex value like #e7fe55";
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) return onError(problem);

    let { videoUrl } = form;
    let duration = padDuration(form.duration);

    // Phase 1 — upload (only when a new file was picked).
    if (pending) {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setPhase("uploading");
      setProgress(0);
      try {
        const result = await uploadToCloudinary(pending.file, setProgress, ctrl.signal);
        videoUrl = result.videoUrl;
        if (!duration && result.duration) duration = formatDuration(result.duration);
        // Keep the uploaded URL so a failed commit doesn't force a re-upload.
        setForm((f) => ({ ...f, videoUrl, duration }));
        replacePending(null);
      } catch (err) {
        setPhase("idle");
        setProgress(null);
        if (err instanceof DOMException && err.name === "AbortError") return;
        return onError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        abortRef.current = null;
      }
      setProgress(null);
    }

    if (!DURATION_RE.test(duration)) {
      setPhase("idle");
      return onError("Duration must be MM:SS or HH:MM:SS");
    }

    // Phase 2 — commit to GitHub via the API.
    setPhase("saving");
    const project: Project = {
      id: isEdit ? target.project.id : "",
      title: form.title.trim(),
      category: form.category,
      year: Number(form.year),
      client: form.client.trim(),
      role: form.role.trim(),
      tools: form.tools,
      duration,
      description: form.description.trim(),
      videoUrl,
      // Poster follows orientation (9:16 or 16:9) so the site never letterboxes it.
      thumbnail: (videoUrl && posterFor(videoUrl, form.orientation)) || form.thumbnail,
      featured: form.featured,
      accentColor: form.accentColor.toLowerCase(),
      orientation: form.orientation,
    };
    try {
      await onSubmit(project);
    } catch (err) {
      setPhase("idle");
      onError(err instanceof Error ? err.message : "Save failed");
    }
  };

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? `Edit ${target.project.title}` : "New project"}
      data-lenis-prevent
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="admin-fade fixed inset-0 z-[150] flex items-stretch justify-center overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm sm:items-start sm:p-6 md:p-10"
    >
      {/* Clip reveal (bottom → top): the panel unveils upward into place. */}
      <div className="admin-clip-reveal-up relative flex min-h-full w-full max-w-3xl flex-col border-white/10 bg-[#0a0a0a] sm:min-h-0 sm:border">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black uppercase tracking-tight">{isEdit ? "Edit project" : "New project"}</h2>
            {form.category === "ai" && <AiChip />}
          </div>
          <button type="button" onClick={close} aria-label="Close" className="px-2 text-xl leading-none text-white/50 hover:text-white">
            ×
          </button>
        </header>

        <div className="grid flex-1 gap-6 p-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <VideoUploader
            videoUrl={form.videoUrl}
            pendingPreview={pending?.url ?? null}
            pendingName={pending?.file.name ?? null}
            orientation={form.orientation}
            progress={progress}
            disabled={busy}
            onSelect={(file) => replacePending({ file, url: URL.createObjectURL(file) })}
            onDuration={(seconds) => {
              if (!form.duration && seconds > 0) set("duration", formatDuration(seconds));
            }}
            onError={onError}
          />

          <fieldset disabled={busy} className="grid grid-cols-2 content-start gap-4 disabled:opacity-60">
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
                placeholder={pending ? "auto" : "MM:SS"}
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
                    <input
                      type="radio"
                      name="orientation"
                      value={o}
                      checked={form.orientation === o}
                      onChange={() => set("orientation", o)}
                      className="sr-only"
                    />
                    {o === "vertical" ? "9:16" : "16:9"}
                    <span className="hidden sm:inline">{o}</span>
                  </label>
                ))}
              </div>
            </div>

            <Field label="Tools" className="col-span-2">
              <div className={`${inputCls} flex flex-wrap items-center gap-1.5 focus-within:border-[#e7fe55]`}>
                {form.tools.map((t) => (
                  <span key={t} className="flex items-center gap-1 rounded-sm bg-white/10 px-2 py-0.5 text-xs">
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove ${t}`}
                      onClick={() => set("tools", form.tools.filter((x) => x !== t))}
                      className="text-white/50 hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  list="admin-tools"
                  value={toolDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.endsWith(",")) addTool(v);
                    else setToolDraft(v);
                  }}
                  onKeyDown={onToolKey}
                  onBlur={() => toolDraft && addTool(toolDraft)}
                  placeholder={form.tools.length ? "" : "Type + Enter"}
                  className="min-w-24 flex-1 bg-transparent py-0.5 outline-none placeholder:text-white/25"
                />
                <datalist id="admin-tools">
                  {knownTools.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </Field>

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
              <button
                type="button"
                role="switch"
                aria-checked={form.featured}
                onClick={() => set("featured", !form.featured)}
                className="flex h-9 items-center gap-3"
              >
                <span className={`relative h-5 w-9 rounded-full transition-colors ${form.featured ? "bg-[#e7fe55]" : "bg-white/15"}`}>
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-[#0a0a0a] transition-[left] ${form.featured ? "left-[18px]" : "left-0.5"}`}
                  />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/60">{form.featured ? "On home" : "Off"}</span>
              </button>
            </div>

            <Field label="Description" className="col-span-2">
              <textarea
                rows={4}
                className={`${inputCls} resize-y`}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </fieldset>
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-[#0a0a0a] px-5 py-4">
          <span className="mr-auto font-mono text-[10px] uppercase tracking-widest text-white/40">
            {phase === "uploading" && `Uploading ${progress ?? 0}%…`}
            {phase === "saving" && "Committing to GitHub…"}
            {phase === "deleting" && "Deleting…"}
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
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="border border-[#ff2d2d]/50 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-[#ff5a5a] hover:bg-[#ff2d2d]/10 disabled:opacity-40"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="bg-[#e7fe55] px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0a0a0a] hover:bg-[#f0ff8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e7fe55] disabled:opacity-50"
          >
            {phase === "uploading" ? "Uploading…" : phase === "saving" ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
