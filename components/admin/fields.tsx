"use client";

import { useState } from "react";
import { btn, card, input, micro } from "./ui";

/**
 * Sprint 11 editors shared by the Brand, Categories, Text, Numbers, Icons and
 * Interview tabs — same look as ui.tsx, kept apart so that file stays small.
 */

/** An editable list of short strings (traits, rules, keywords). */
export function ListEditor({
  label,
  items,
  onChange,
  max = 20,
  maxLength = 200,
  placeholder = "Add…",
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  max?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t || items.length >= max) return;
    onChange([...items, t]);
    setDraft("");
  };
  return (
    <div className={`${card} p-3`}>
      <p className={`${micro} mb-2 text-white/50`}>{label}</p>
      <ul className="mb-2 flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5">
            <input
              aria-label={`${label} ${i + 1}`}
              value={item}
              maxLength={maxLength}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              className={input}
            />
            <button type="button" className={btn} aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={draft} maxLength={maxLength} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} className={input} aria-label={`New ${label}`} />
        <button type="submit" className={btn} disabled={!draft.trim() || items.length >= max}>
          Add
        </button>
      </form>
    </div>
  );
}

/** Slider + exact number input, no maximum on the typed value beyond `hardMax`. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hardMax,
  unit,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  /** The slider's end. */
  max: number;
  step?: number;
  /** What the typed value may reach (defaults to max). */
  hardMax?: number;
  unit?: string;
  hint?: string;
}) {
  const top = hardMax ?? max;
  const set = (v: number) => {
    if (Number.isFinite(v)) onChange(Math.min(top, Math.max(min, v)));
  };
  return (
    <div className={`${card} px-3 py-2.5`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            aria-label={`${label} value`}
            value={Number.isFinite(value) ? value : ""}
            min={min}
            max={top}
            step={step}
            onChange={(e) => set(Number(e.target.value))}
            className="w-20 border border-white/10 bg-black/40 px-1.5 py-0.5 text-right font-mono text-[11px] tabular-nums text-[#e7fe55] focus:border-[#e7fe55]/60 focus:outline-none"
          />
          {unit && <span className="font-mono text-[10px] text-white/40">{unit}</span>}
        </span>
      </div>
      {hint && <span className="block font-mono text-[9px] uppercase tracking-widest text-white/35">{hint}</span>}
      <input
        type="range"
        min={min}
        max={Math.max(max, Math.min(top, value))}
        step={step}
        value={Math.min(top, value)}
        aria-label={label}
        onChange={(e) => set(Number(e.target.value))}
        className="mt-2 w-full accent-[#e7fe55]"
      />
    </div>
  );
}

/** A pose picker over every pose id (ladder, up/down, expressions). */
export function PoseSelect({
  label,
  value,
  poses,
  onChange,
}: {
  label: string;
  value: string;
  poses: { id: string; label: string; src: string }[];
  onChange: (id: string) => void;
}) {
  const current = poses.find((p) => p.id === value);
  return (
    <label className={`${card} flex items-center gap-3 p-2`}>
      <span className="relative size-12 shrink-0 overflow-hidden bg-[#7a8899]">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
        {current && <img src={current.src} alt="" className="absolute inset-0 size-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`${micro} block text-white/50`}>{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${input} mt-1`}>
          {poses.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

export const slugify = (s: string, fallback = "item") =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || fallback;

export function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
