"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * The admin's small design system: one set of controls for every tab so the
 * control center reads as one instrument. Always dark (admin.css), lime
 * accent, mono micro-labels.
 */

export const LIME = "#e7fe55";
export const btn =
  "inline-flex items-center justify-center gap-1.5 border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white/75 transition-colors hover:border-white/40 hover:text-white disabled:pointer-events-none disabled:opacity-35";
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[#e7fe55] px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0a0a0a] transition-colors hover:bg-[#f0ff8a] disabled:pointer-events-none disabled:opacity-40";
export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 border border-[#ff2d2d]/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[#ff6b6b] transition-colors hover:bg-[#ff2d2d]/10 disabled:pointer-events-none disabled:opacity-35";
export const input =
  "w-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder:text-white/25 focus:border-[#e7fe55]/60 focus:outline-none";
export const card = "border border-white/10 bg-white/[0.02]";
export const micro = "font-mono text-[10px] uppercase tracking-widest";

export function TabHeader({ title, hint, actions }: { title: string; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">{title}</h1>
        {hint && <p className={`${micro} mt-1 max-w-3xl text-white/40`}>{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  hint,
  aside,
  onReset,
  help,
  children,
  className = "",
}: {
  title: string;
  hint?: ReactNode;
  aside?: ReactNode;
  /** Shows a "Reset" button that puts just this section back to its factory default. */
  onReset?: () => void;
  /** A "?" tooltip beside the title. */
  help?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`mb-10 ${className}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-2">
        <div className="min-w-0">
          <h2 id={id} className="flex items-center gap-2 text-lg font-black uppercase tracking-tight">
            {title}
            {help && <Help>{help}</Help>}
          </h2>
          {hint && <p className={`${micro} mt-0.5 text-white/40`}>{hint}</p>}
        </div>
        {(aside || onReset) && (
          <div className="flex flex-wrap items-center gap-2">
            {aside}
            {onReset && (
              <button type="button" className={btn} onClick={onReset} title={`Reset ${title} to its default`}>
                ↺ Reset
              </button>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  help,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  help?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`${card} flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 ${disabled ? "pointer-events-none opacity-40" : ""}`}>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm">
          {label}
          {help && <Help>{help}</Help>}
        </span>
        {hint && <span className="block font-mono text-[9px] uppercase tracking-widest text-white/35">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full bg-white/15 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[#e7fe55] peer-checked:after:translate-x-4 peer-checked:after:bg-[#0a0a0a] peer-focus-visible:ring-1 peer-focus-visible:ring-[#e7fe55]"
      />
    </label>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  format = (v: number) => v.toFixed(2),
  hint,
  help,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  hint?: string;
  help?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`${card} block px-3 py-2.5 ${disabled ? "opacity-40" : ""}`}>
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          {label}
          {help && <Help>{help}</Help>}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-[#e7fe55]">{format(value)}</span>
      </span>
      {hint && <span className="block font-mono text-[9px] uppercase tracking-widest text-white/35">{hint}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#e7fe55]"
      />
    </label>
  );
}

export function Field({
  label,
  hint,
  counter,
  children,
}: {
  label: string;
  hint?: ReactNode;
  /** [current, max] — turns amber past 90%, red past the max. */
  counter?: [number, number];
  children: ReactNode;
}) {
  const [n, max] = counter ?? [0, 0];
  return (
    <label className="block">
      <span className={`${micro} mb-1 flex items-center justify-between gap-3 text-white/50`}>
        <span>{label}</span>
        {counter && (
          <span className={`tabular-nums ${n > max ? "text-[#ff6b6b]" : n > max * 0.9 ? "text-[#ffb54d]" : "text-white/30"}`}>
            {n}/{max}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block font-mono text-[9px] uppercase tracking-widest text-white/30">{hint}</span>}
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <label className={`${card} flex items-center gap-3 px-3 py-2`}>
      <span className="relative size-8 shrink-0 overflow-hidden rounded-sm border border-white/15" style={{ background: valid ? value : "transparent" }}>
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          spellCheck={false}
          aria-label={`${label} hex`}
          className={`w-24 bg-transparent font-mono text-[11px] uppercase tracking-wider focus:outline-none ${valid ? "text-white/50" : "text-[#ff6b6b]"}`}
        />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`-ml-px border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors first:ml-0 ${
            value === o.value ? "relative z-10 border-[#e7fe55] bg-[#e7fe55]/10 text-[#e7fe55]" : "border-white/15 text-white/50 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  const dot = tone === "ok" ? "bg-[#3dffb0]" : tone === "warn" ? "bg-[#ffb54d]" : tone === "bad" ? "bg-[#ff2d2d]" : "";
  return (
    <div className={`${card} flex min-w-0 flex-col gap-1 px-4 py-3`}>
      <span className={`${micro} flex items-center gap-1.5 text-[9px] text-white/40`}>
        {tone && <span className={`size-1.5 rounded-full ${dot}`} />}
        {label}
      </span>
      <span className="truncate text-2xl font-black tabular-nums tracking-tight">{value}</span>
      {sub && <span className={`${micro} truncate text-[9px] text-white/35`}>{sub}</span>}
    </div>
  );
}

/** Hand-drawn SVG sparkline — no chart library. */
export function Sparkline({ values, label, width = 160, height = 36 }: { values: number[]; label: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label} className="overflow-visible">
      <path d={area} fill={LIME} fillOpacity="0.08" />
      <path d={line} fill="none" stroke={LIME} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill={LIME} />}
    </svg>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={`${micro} py-16 text-center text-white/35`}>{children}</p>;
}

export function Loading({ what }: { what: string }) {
  return <p className={`${micro} py-24 text-center text-white/40`}>Loading {what}…</p>;
}

/** Days → "today" / "3d ago" style label. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * A "?" that explains a non-obvious control. Hover, focus or tap shows it;
 * it never steals the click from the control it sits in.
 */
export function Help({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex font-sans normal-case tracking-normal">
      <button
        type="button"
        aria-label="Help"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex size-4 items-center justify-center rounded-full border border-white/25 font-mono text-[9px] font-normal text-white/50 hover:border-[#e7fe55] hover:text-[#e7fe55]"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="admin-fade absolute left-1/2 top-full z-50 mt-1.5 w-64 -translate-x-1/2 border border-white/15 bg-[#151515] px-3 py-2 text-left text-xs font-normal leading-relaxed text-white/80 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** One of a handful of options as large cards (heroes, cursor styles, LUTs…). */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
  columns = "sm:grid-cols-3 xl:grid-cols-5",
}: {
  value: T;
  options: readonly { value: T; label: string; preview?: ReactNode; note?: string }[];
  onChange: (v: T) => void;
  label: string;
  columns?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid grid-cols-2 gap-2 ${columns}`}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`${card} flex flex-col gap-2 p-2 text-left transition-colors ${on ? "border-[#e7fe55] bg-[#e7fe55]/[0.06]" : "hover:border-white/30"}`}
          >
            {o.preview && <span className="relative block overflow-hidden">{o.preview}</span>}
            <span className={`${micro} ${on ? "text-[#e7fe55]" : "text-white/70"}`}>{o.label}</span>
            {o.note && <span className="text-[11px] leading-snug text-white/40">{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The per-tab save bar: shows while THIS tab has unsaved edits. "Discard tab"
 * rolls back only what this tab edits; "Save" commits every dirty file.
 */
export function SaveBar({ names, saving, onDiscard, onSave }: { names: string[]; saving: boolean; onDiscard: () => void; onSave: () => void }) {
  if (!names.length) return null;
  return (
    <div className="admin-clip-reveal-up sticky bottom-4 z-30 mt-10 flex flex-wrap items-center gap-3 border border-[#e7fe55]/40 bg-[#111]/95 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.7)] backdrop-blur">
      <span className="size-2 animate-pulse rounded-full bg-[#e7fe55]" />
      <span className={`${micro} min-w-0 flex-1 truncate text-[#e7fe55]`} title={names.join(", ")}>
        Unsaved in this tab: {names.join(", ")}
      </span>
      <button type="button" className={btn} disabled={saving} onClick={onDiscard}>
        Discard tab
      </button>
      <button type="button" className={btnPrimary} disabled={saving} onClick={onSave}>
        {saving ? "Saving…" : "Save & deploy"}
      </button>
    </div>
  );
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
