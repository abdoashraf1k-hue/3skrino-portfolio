"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import ReorderList from "@/components/admin/ReorderList";
import type { BrandLogo, HeroConfig, HeroFeatures, HeroPose } from "@/data/hero-config";
import { AuthError, adminFetch } from "@/lib/admin/client-api";
import { assertLogoFile, assertPoseFile, POSE_MAX_EDGE, upscaleImage, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { HERO_PREVIEW_MESSAGE } from "@/lib/hero-config-client";

type HeroResponse = { config: HeroConfig; sha: string };
type Props = {
  adminKey: string;
  /** False while another admin tab is showing (the panel stays mounted to keep its draft). */
  active: boolean;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onAuthError: () => void;
};
type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };
/** Which pose slot: a ladder index, or the vertical poses. */
type PoseSlot = number | "up" | "down";

const PREVIEW = { width: 1280, height: 800 };
const card = "border border-white/10 bg-white/[0.02]";
const btn =
  "border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-white/70 hover:border-white/40 hover:text-white disabled:pointer-events-none disabled:opacity-35";
const input =
  "w-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder:text-white/25 focus:border-[#e7fe55]/60 focus:outline-none";
const checker =
  "bg-[length:16px_16px] bg-[linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%),linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%)] bg-[position:0_0,8px_8px] bg-[#111]";

let rowSeq = 0;
const rowId = () => `r${++rowSeq}`;

const titleFromFile = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 60) || "Brand";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "brand";

function uniqueId(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function Section({ id, title, hint, children, aside }: { id: string; title: string; hint?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-2">
        <div>
          <h2 id={id} className="text-lg font-black uppercase tracking-tight">
            {title}
          </h2>
          {hint && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-white/40">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className={`${card} flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5`}>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block font-mono text-[9px] uppercase tracking-widest text-white/35">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full bg-white/15 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[#e7fe55] peer-checked:after:translate-x-4 peer-checked:after:bg-[#0a0a0a] peer-focus-visible:ring-1 peer-focus-visible:ring-[#e7fe55]"
      />
    </label>
  );
}

function Slider({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className={`${card} block px-3 py-2.5`}>
      <span className="flex items-center justify-between text-sm">
        {label}
        <span className="font-mono text-[11px] tabular-nums text-[#e7fe55]">{value.toFixed(2)}</span>
      </span>
      {hint && <span className="block font-mono text-[9px] uppercase tracking-widest text-white/35">{hint}</span>}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#e7fe55]"
      />
    </label>
  );
}

export default function HeroAdmin({ adminKey, active, onError, onSuccess, onAuthError }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [saved, setSaved] = useState<HeroConfig | null>(null);
  const [draft, setDraft] = useState<HeroConfig | null>(null);
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** Per-asset progress / activity label, keyed by pose id or logo id. */
  const [busy, setBusy] = useState<Record<string, string>>({});
  /** Natural width of each image src, for the "needs upscaling" badge. */
  const [dims, setDims] = useState<Record<string, number>>({});
  const [newRole, setNewRole] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameWrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [frameKey, setFrameKey] = useState(0);

  const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof AuthError) return onAuthError();
      onError(err instanceof Error ? err.message : fallback);
    },
    [onAuthError, onError],
  );

  const adopt = useCallback((config: HeroConfig) => {
    setSaved(config);
    setDraft(config);
    setRoleKeys(config.roles.items.map(rowId));
  }, []);

  /** No synchronous setState: the mount effect calls this directly; Retry flips to "loading" first. */
  const load = useCallback(
    () =>
      adminFetch<HeroResponse>(adminKey, "hero", "GET").then(
        (res) => {
          adopt(res.config);
          setStatus({ kind: "ready" });
        },
        (err: unknown) => {
          if (err instanceof AuthError) return onAuthError();
          setStatus({ kind: "error", message: err instanceof Error ? err.message : "Couldn't load hero settings" });
        },
      ),
    [adminKey, adopt, onAuthError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /* -------------------------- live preview -------------------------- */
  const postDraft = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (win && draft) win.postMessage({ type: HERO_PREVIEW_MESSAGE, config: draft }, window.location.origin);
  }, [draft]);

  useEffect(() => {
    const id = window.setTimeout(postDraft, 120);
    return () => window.clearTimeout(id);
  }, [postDraft]);

  useEffect(() => {
    const onMsg = (e: MessageEvent<unknown>) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data;
      if (typeof d === "object" && d !== null && "type" in d && d.type === `${HERO_PREVIEW_MESSAGE}:ready`) postDraft();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [postDraft]);

  useEffect(() => {
    const el = frameWrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / PREVIEW.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [status.kind]);

  // Unsaved changes: warn before leaving; Ctrl/⌘+S saves.
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const res = await adminFetch<HeroResponse>(adminKey, "hero", "PUT", { config: draft });
      adopt(res.config);
      onSuccess("Hero saved — deploying…");
    } catch (err) {
      fail(err, "Save failed");
    } finally {
      setSaving(false);
    }
  }, [adminKey, adopt, draft, fail, onSuccess, saving]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, save]);

  if (status.kind === "loading" || !draft) {
    return status.kind === "error" ? (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="max-w-md text-sm text-[#ff5a5a]">{status.message}</p>
        <button
          type="button"
          onClick={() => {
            setStatus({ kind: "loading" });
            void load();
          }}
          className={btn}
        >
          Retry
        </button>
      </div>
    ) : (
      <p className="py-24 text-center font-mono text-[11px] uppercase tracking-widest text-white/40">Loading hero settings…</p>
    );
  }

  /* ----------------------------- updates ---------------------------- */
  const update = (fn: (c: HeroConfig) => HeroConfig) => setDraft((d) => (d ? fn(d) : d));
  const setFeature = <K extends keyof HeroFeatures>(k: K, v: HeroFeatures[K]) =>
    update((c) => ({ ...c, features: { ...c.features, [k]: v } }));

  const getPose = (slot: PoseSlot): HeroPose => (typeof slot === "number" ? draft.poses.ladder[slot] : draft.poses[slot]);
  const setPose = (slot: PoseSlot, patch: Partial<HeroPose>) =>
    update((c) => {
      if (typeof slot === "number") {
        const ladder = c.poses.ladder.map((p, i) => (i === slot ? { ...p, ...patch } : p));
        return { ...c, poses: { ...c.poses, ladder } };
      }
      return { ...c, poses: { ...c.poses, [slot]: { ...c.poses[slot], ...patch } } };
    });

  const setLogos = (fn: (items: BrandLogo[]) => BrandLogo[]) =>
    update((c) => ({ ...c, logos: { ...c.logos, items: fn(c.logos.items) } }));
  const setLogo = (id: string, patch: Partial<BrandLogo>) =>
    setLogos((items) => items.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const track = (id: string, label: string | null) =>
    setBusy((b) => {
      const next = { ...b };
      if (label === null) delete next[id];
      else next[id] = label;
      return next;
    });

  const replacePose = async (slot: PoseSlot, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const pose = getPose(slot);
    try {
      assertPoseFile(file);
      track(pose.id, "0%");
      const url = await uploadHeroAsset(file, "hero", pose.id, adminKey, (p) => track(pose.id, `${p}%`));
      setPose(slot, { src: url });
    } catch (err) {
      fail(err, "Upload failed");
    } finally {
      track(pose.id, null);
    }
  };

  const upscalePose = async (slot: PoseSlot) => {
    const pose = getPose(slot);
    try {
      track(pose.id, "Upscaling…");
      const { blob } = await upscaleImage(pose.src, POSE_MAX_EDGE);
      track(pose.id, "0%");
      const url = await uploadHeroAsset(blob, "hero", `${pose.id}-upscaled`, adminKey, (p) => track(pose.id, `${p}%`));
      setPose(slot, { src: url });
      onSuccess(`${pose.label} upscaled to ${POSE_MAX_EDGE}px — save to publish`);
    } catch (err) {
      fail(err, "Upscale failed");
    } finally {
      track(pose.id, null);
    }
  };

  const addLogos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    for (const file of files) {
      const tmp = `upload-${file.name}`;
      try {
        assertLogoFile(file);
        track(tmp, "0%");
        const name = titleFromFile(file.name);
        const url = await uploadHeroAsset(file, "brands", name, adminKey, (p) => track(tmp, `${p}%`));
        setLogos((items) => [
          ...items,
          { id: uniqueId(slugify(name), new Set(items.map((l) => l.id))), name, imageUrl: url, size: 56, visible: true },
        ]);
      } catch (err) {
        fail(err, "Upload failed");
      } finally {
        track(tmp, null);
      }
    }
  };

  const replaceLogo = async (logo: BrandLogo, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      assertLogoFile(file);
      track(logo.id, "0%");
      const url = await uploadHeroAsset(file, "brands", logo.name, adminKey, (p) => track(logo.id, `${p}%`));
      setLogo(logo.id, { imageUrl: url });
    } catch (err) {
      fail(err, "Upload failed");
    } finally {
      track(logo.id, null);
    }
  };

  const roles = draft.roles.items.map((text, i) => ({ id: roleKeys[i] ?? `k${i}`, text }));
  const setRoles = (rows: { id: string; text: string }[]) => {
    setRoleKeys(rows.map((r) => r.id));
    update((c) => ({ ...c, roles: { ...c.roles, items: rows.map((r) => r.text) } }));
  };
  const addRole = () => {
    const text = newRole.trim();
    if (!text) return;
    setRoles([...roles, { id: rowId(), text }]);
    setNewRole("");
  };

  /* ------------------------------ views ----------------------------- */
  const poseCard = (slot: PoseSlot, move?: (d: number) => void) => {
    const pose = getPose(slot);
    const w = dims[pose.src];
    const low = w !== undefined && w < 1000;
    const activity = busy[pose.id];
    return (
      <div className={`${card} flex h-full flex-col`}>
        <div className={`relative aspect-square ${checker}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of an arbitrary blob/local URL */}
          <img
            src={pose.src}
            alt={pose.label}
            draggable={false}
            onLoad={(e) => {
              const nw = e.currentTarget.naturalWidth;
              setDims((d) => (d[pose.src] === nw ? d : { ...d, [pose.src]: nw }));
            }}
            className="absolute inset-0 size-full object-contain"
          />
          {slot === 3 && (
            <span className="absolute left-1.5 top-1.5 bg-[#e7fe55] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-black">
              Rest
            </span>
          )}
          {w !== undefined && (
            <span
              className={`absolute bottom-1.5 right-1.5 px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${
                low ? "bg-[#ff2d2d] text-white" : "bg-black/70 text-white/70"
              }`}
              title={low ? "Under 1000px — upscale or replace" : undefined}
            >
              {w}px
            </span>
          )}
          {activity && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-[10px] uppercase tracking-widest text-[#e7fe55]">
              {activity}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-bold uppercase tracking-wide">{pose.label}</span>
            <input
              type="color"
              value={pose.tint}
              onChange={(e) => setPose(slot, { tint: e.target.value })}
              aria-label={`${pose.label} rim tint`}
              title="Reactive-lighting tint"
              className="h-5 w-7 shrink-0 cursor-pointer border border-white/15 bg-transparent"
            />
          </div>
          <div className="mt-auto flex flex-wrap gap-1">
            <label className={`${btn} cursor-pointer`}>
              Replace
              <input type="file" accept="image/png,image/webp" className="sr-only" onChange={(e) => void replacePose(slot, e)} />
            </label>
            <button
              type="button"
              className={btn}
              disabled={Boolean(activity) || w === undefined || w >= POSE_MAX_EDGE}
              onClick={() => void upscalePose(slot)}
              title={w !== undefined && w >= POSE_MAX_EDGE ? "Already full resolution" : `Upscale to ${POSE_MAX_EDGE}px`}
            >
              Upscale
            </button>
            {move && (
              <span className="ml-auto flex gap-1">
                <button type="button" className={btn} aria-label={`Move ${pose.label} left`} onClick={() => move(-1)} disabled={slot === 0}>
                  ←
                </button>
                <button type="button" className={btn} aria-label={`Move ${pose.label} right`} onClick={() => move(1)} disabled={slot === 6}>
                  →
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const f = draft.features;
  const uploadingLogos = Object.entries(busy).filter(([k]) => k.startsWith("upload-"));

  return (
    <div>
      <div className="sticky top-14 z-30 -mx-4 mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0a0a0a]/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Hero</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/40">
            changes preview live · save commits data/hero-config.ts and redeploys · Ctrl S
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="font-mono text-[10px] uppercase tracking-widest text-[#e7fe55]">● Unsaved changes</span>}
          <button type="button" className={btn} disabled={!dirty || saving} onClick={() => saved && adopt(saved)}>
            Revert
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="bg-[#e7fe55] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0a0a0a] hover:bg-[#f0ff8a] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div className="min-w-0">
          {/* A — poses */}
          <Section
            id="hero-poses"
            title="Head poses"
            hint="drag (or Alt ←/→) to reorder the ladder · left → right follows the pointer · keep every pose in the same framing"
          >
            <ReorderList
              label="Pose ladder"
              direction="row"
              items={draft.poses.ladder}
              getId={(p) => p.id}
              onChange={(ladder) => update((c) => ({ ...c, poses: { ...c.poses, ladder } }))}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
              itemClassName="cursor-grab active:cursor-grabbing"
              render={(_, i, move) => poseCard(i, move)}
            />
            <p className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-widest text-white/40">
              Vertical — blends in near the centre column when the pointer is high / low
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {poseCard("up")}
              {poseCard("down")}
            </div>
          </Section>

          {/* B — logos */}
          <Section
            id="hero-logos"
            title="Brand logos"
            hint="float around the silhouette · drag the ⋮⋮ handle to reorder"
            aside={
              <label className={`${btn} cursor-pointer border-[#e7fe55]/40 text-[#e7fe55]`}>
                + Add logos
                <input type="file" multiple accept="image/png,image/svg+xml,image/webp,image/jpeg" className="sr-only" onChange={(e) => void addLogos(e)} />
              </label>
            }
          >
            <div className="mb-3 max-w-sm">
              <Toggle
                label="Enable floating logos"
                checked={draft.logos.enabled}
                onChange={(v) => update((c) => ({ ...c, logos: { ...c.logos, enabled: v } }))}
              />
            </div>
            {uploadingLogos.map(([k, label]) => (
              <p key={k} className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#e7fe55]">
                Uploading {k.slice(7)} — {label}
              </p>
            ))}
            {draft.logos.items.length === 0 ? (
              <p className="py-8 text-center font-mono text-[10px] uppercase tracking-widest text-white/35">No logos yet</p>
            ) : (
              <ReorderList
                label="Brand logos"
                handle
                items={draft.logos.items}
                getId={(l) => l.id}
                onChange={(items) => setLogos(() => items)}
                className="flex flex-col gap-1.5"
                render={(logo, i, move) => (
                  <div className={`${card} flex flex-wrap items-center gap-3 p-2 ${logo.visible ? "" : "opacity-50"}`}>
                    <span data-drag-handle className="cursor-grab select-none px-1 text-white/30 active:cursor-grabbing" aria-hidden>
                      ⋮⋮
                    </span>
                    <span className={`relative size-12 shrink-0 ${checker}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                      <img src={logo.imageUrl} alt="" className="absolute inset-1 size-10 object-contain" />
                      {busy[logo.id] && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-[9px] text-[#e7fe55]">
                          {busy[logo.id]}
                        </span>
                      )}
                    </span>
                    <input
                      aria-label="Name"
                      value={logo.name}
                      maxLength={60}
                      onChange={(e) => setLogo(logo.id, { name: e.target.value })}
                      className={`${input} min-w-32 flex-1`}
                    />
                    <input
                      aria-label="Link (reference only)"
                      placeholder="https://… (not clickable)"
                      value={logo.href ?? ""}
                      onChange={(e) => setLogo(logo.id, { href: e.target.value || undefined })}
                      className={`${input} min-w-40 flex-1`}
                    />
                    <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/50">
                      Size
                      <input
                        type="range"
                        min={40}
                        max={80}
                        step={2}
                        value={logo.size ?? 56}
                        onChange={(e) => setLogo(logo.id, { size: Number(e.target.value) })}
                        className="w-20 accent-[#e7fe55]"
                      />
                      <span className="w-6 tabular-nums text-white/70">{logo.size ?? 56}</span>
                    </label>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className={btn}
                        aria-pressed={logo.visible}
                        onClick={() => setLogo(logo.id, { visible: !logo.visible })}
                      >
                        {logo.visible ? "Visible" : "Hidden"}
                      </button>
                      <label className={`${btn} cursor-pointer`}>
                        Image
                        <input
                          type="file"
                          accept="image/png,image/svg+xml,image/webp,image/jpeg"
                          className="sr-only"
                          onChange={(e) => void replaceLogo(logo, e)}
                        />
                      </label>
                      <button type="button" className={btn} aria-label={`Move ${logo.name} up`} disabled={i === 0} onClick={() => move(-1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        className={btn}
                        aria-label={`Move ${logo.name} down`}
                        disabled={i === draft.logos.items.length - 1}
                        onClick={() => move(1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff5a5a]`}
                        onClick={() => setLogos((items) => items.filter((l) => l.id !== logo.id))}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                )}
              />
            )}
          </Section>

          {/* C — features */}
          <Section id="hero-features" title="Hero features" hint="the scene only runs on desktop with motion allowed">
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle
                label="Ambient sound"
                hint="off by default · starts after the visitor interacts · mute in the nav"
                checked={f.ambientSound}
                onChange={(v) => setFeature("ambientSound", v)}
              />
              <Toggle label="Cinematic bars" hint="6vh letterbox · slides out on scroll" checked={f.cinematicBars} onChange={(v) => setFeature("cinematicBars", v)} />
              <Toggle label="Reactive lighting" hint="rim + bloom follow the pose tint" checked={f.reactiveLighting} onChange={(v) => setFeature("reactiveLighting", v)} />
              <Toggle label="Camera shake" hint="on fast pointer flicks" checked={f.cameraShake} onChange={(v) => setFeature("cameraShake", v)} />
              <Toggle label="Glitch" hint="a 2–3px jolt every 8–12s" checked={f.glitch} onChange={(v) => setFeature("glitch", v)} />
              <Slider label="Parallax depth" hint="stars · sun · grid drift" value={f.parallax} onChange={(v) => setFeature("parallax", v)} />
              <Slider label="Chromatic aberration" hint="0 off · 0.5 original" value={f.chromaticAberration} onChange={(v) => setFeature("chromaticAberration", v)} />
              <Slider label="Bloom intensity" hint="0.5 original" value={f.bloom} onChange={(v) => setFeature("bloom", v)} />
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-white/50">
                Ambient file — empty = synthesised drone · /audio/hero-ambient.mp3 is a silent placeholder until replaced
              </span>
              <input
                value={draft.ambientSrc}
                placeholder="(synthesised)"
                onChange={(e) => update((c) => ({ ...c, ambientSrc: e.target.value.trim() }))}
                className={input}
              />
            </label>
          </Section>

          {/* D — roles */}
          <Section id="hero-roles" title="Nav roles" hint="the descriptor next to the wordmark · reduced motion shows “Creative Studio”">
            <ReorderList
              label="Roles"
              handle
              items={roles}
              getId={(r) => r.id}
              onChange={setRoles}
              className="mb-3 flex flex-col gap-1.5"
              render={(role, i, move) => (
                <div className={`${card} flex items-center gap-2 p-1.5`}>
                  <span data-drag-handle className="cursor-grab select-none px-1 text-white/30 active:cursor-grabbing" aria-hidden>
                    ⋮⋮
                  </span>
                  <input
                    aria-label={`Role ${i + 1}`}
                    value={role.text}
                    maxLength={32}
                    onChange={(e) => setRoles(roles.map((r) => (r.id === role.id ? { ...r, text: e.target.value } : r)))}
                    className={`${input} uppercase`}
                  />
                  <button type="button" className={btn} aria-label="Move up" disabled={i === 0} onClick={() => move(-1)}>
                    ↑
                  </button>
                  <button type="button" className={btn} aria-label="Move down" disabled={i === roles.length - 1} onClick={() => move(1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff5a5a]`}
                    disabled={roles.length <= 1}
                    onClick={() => setRoles(roles.filter((r) => r.id !== role.id))}
                  >
                    Remove
                  </button>
                </div>
              )}
            />
            <div className="flex flex-wrap items-end gap-3">
              <form
                className="flex min-w-60 flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addRole();
                }}
              >
                <input
                  value={newRole}
                  maxLength={32}
                  placeholder="New role…"
                  onChange={(e) => setNewRole(e.target.value)}
                  className={`${input} uppercase`}
                />
                <button type="submit" className={btn} disabled={!newRole.trim() || roles.length >= 20}>
                  Add
                </button>
              </form>
              <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/50">
                Every
                <input
                  type="number"
                  min={1.5}
                  max={30}
                  step={0.5}
                  value={draft.roles.interval}
                  onChange={(e) => update((c) => ({ ...c, roles: { ...c.roles, interval: Number(e.target.value) || 3 } }))}
                  className={`${input} w-20 tabular-nums`}
                />
                seconds
              </label>
            </div>
          </Section>
        </div>

        {/* E — live preview */}
        <aside className="min-w-0 xl:sticky xl:top-36 xl:self-start">
          <Section
            id="hero-preview"
            title="Live preview"
            hint="unsaved settings apply instantly · move the mouse over it"
            aside={
              <button type="button" className={btn} onClick={() => setFrameKey((k) => k + 1)}>
                Reload
              </button>
            }
          >
            <div ref={frameWrap} className="relative w-full overflow-hidden border border-white/10 bg-black" style={{ height: PREVIEW.height * scale }}>
              <iframe
                key={frameKey}
                ref={frameRef}
                src="/?heroPreview=1"
                title="Hero preview"
                onLoad={postDraft}
                className="absolute left-0 top-0 origin-top-left border-0"
                style={{ width: PREVIEW.width, height: PREVIEW.height, transform: `scale(${scale})` }}
              />
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
