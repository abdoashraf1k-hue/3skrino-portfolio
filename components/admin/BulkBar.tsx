"use client";

import { useState } from "react";
import { categories } from "@/data/categories";

export type BulkAction = { action: "feature" | "unfeature" | "delete" } | { action: "category"; category: string };

type Props = {
  count: number;
  busy: boolean;
  onRun: (action: BulkAction) => void;
  onCancel: () => void;
};

const btn =
  "h-9 shrink-0 border border-white/15 px-3 font-mono text-[10px] uppercase tracking-widest text-white/80 hover:border-white/40 hover:text-white disabled:opacity-40";

/** Floating bar that appears while 1+ projects are selected. */
export default function BulkBar({ count, busy, onRun, onCancel }: Props) {
  const [picking, setPicking] = useState(false);

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="admin-clip-reveal-up fixed inset-x-3 bottom-4 z-[120] mx-auto flex max-w-3xl flex-wrap items-center gap-2 border border-[#e7fe55]/30 bg-[#111]/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.7)] backdrop-blur"
    >
      <span className="mr-auto font-mono text-[11px] uppercase tracking-widest text-[#e7fe55]">
        {count} selected{busy && " · working…"}
      </span>
      <button type="button" disabled={busy} className={btn} onClick={() => onRun({ action: "feature" })}>
        ★ Feature
      </button>
      <button type="button" disabled={busy} className={btn} onClick={() => onRun({ action: "unfeature" })}>
        Unfeature
      </button>
      {picking ? (
        <select
          autoFocus
          disabled={busy}
          defaultValue=""
          aria-label="Move selected to category"
          onBlur={() => setPicking(false)}
          onChange={(e) => {
            if (e.target.value) onRun({ action: "category", category: e.target.value });
            setPicking(false);
          }}
          className="h-9 border border-[#e7fe55] bg-[#111] px-2 font-mono text-[10px] uppercase tracking-widest"
        >
          <option value="" disabled>
            Move to…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" disabled={busy} className={btn} onClick={() => setPicking(true)}>
          Change category
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        className={`${btn} border-[#ff2d2d]/50 text-[#ff5a5a] hover:bg-[#ff2d2d]/10`}
        onClick={() => {
          if (window.confirm(`Delete ${count} project${count === 1 ? "" : "s"}? This commits to GitHub and redeploys the site.`)) {
            onRun({ action: "delete" });
          }
        }}
      >
        Delete
      </button>
      <button type="button" disabled={busy} className="h-9 px-2 font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
