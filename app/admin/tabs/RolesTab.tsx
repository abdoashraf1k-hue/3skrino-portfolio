"use client";

import { useState } from "react";
import ReorderList from "@/components/admin/ReorderList";
import { btn, card, input, micro, Section, Slider, TabHeader } from "@/components/admin/ui";
import MidRoleCycler from "@/components/ui/MidRoleCycler";
import RoleCycler from "@/components/ui/RoleCycler";
import { DEFAULT_ROLES } from "@/data/hero-defaults";
import { useConfigStore } from "../store";

let seq = 0;
const rowId = () => `role-${++seq}`;

/** Roles for the nav cycler, the mid-screen cycler and the marquee under the hero. */
export default function RolesTab() {
  const { hero, setHero } = useConfigStore();
  const [keys, setKeys] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  if (!hero) return null;

  const items = hero.roles.items;
  // Stable row ids for drag & drop (roles are plain strings and may repeat while typing).
  const ids = items.map((_, i) => keys[i] ?? `k-${i}`);
  const rows = items.map((text, i) => ({ id: ids[i], text }));
  const setRows = (next: { id: string; text: string }[]) => {
    setKeys(next.map((r) => r.id));
    setHero((c) => ({ ...c, roles: { ...c.roles, items: next.map((r) => r.text) } }));
  };
  const add = () => {
    const text = draft.trim();
    if (!text || rows.length >= 20) return;
    setRows([...rows, { id: rowId(), text }]);
    setDraft("");
  };

  return (
    <div>
      <TabHeader
        title="Roles"
        hint="one list drives the nav descriptor, the big mid-screen line and the marquee · reduced motion shows “Creative Studio”"
        actions={
          <button type="button" className={btn} onClick={() => setHero((c) => ({ ...c, roles: DEFAULT_ROLES }))}>
            Reset roles
          </button>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="min-w-0">
          <Section title="Roles" hint="drag the ⋮⋮ handle (or Alt ↑/↓) to reorder · max 20 · 32 characters each">
            <ReorderList
              label="Roles"
              handle
              items={rows}
              getId={(r) => r.id}
              onChange={setRows}
              className="mb-3 flex flex-col gap-1.5"
              render={(role, i, move) => (
                <div className={`${card} flex items-center gap-2 p-1.5`}>
                  <span data-drag-handle className="cursor-grab select-none px-1 text-white/30 active:cursor-grabbing" aria-hidden>
                    ⋮⋮
                  </span>
                  <span className="w-5 font-mono text-[10px] tabular-nums text-white/30">{String(i + 1).padStart(2, "0")}</span>
                  <input
                    aria-label={`Role ${i + 1}`}
                    value={role.text}
                    maxLength={32}
                    onChange={(e) => setRows(rows.map((r) => (r.id === role.id ? { ...r, text: e.target.value } : r)))}
                    className={`${input} uppercase`}
                  />
                  <button type="button" className={btn} aria-label="Move up" disabled={i === 0} onClick={() => move(-1)}>
                    ↑
                  </button>
                  <button type="button" className={btn} aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff6b6b]`}
                    disabled={rows.length <= 1}
                    onClick={() => setRows(rows.filter((r) => r.id !== role.id))}
                  >
                    Remove
                  </button>
                </div>
              )}
            />
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input value={draft} maxLength={32} placeholder="New role…" onChange={(e) => setDraft(e.target.value)} className={`${input} uppercase`} />
              <button type="submit" className={btn} disabled={!draft.trim() || rows.length >= 20}>
                Add
              </button>
            </form>
          </Section>

          <Section title="Timing">
            <div className="max-w-md">
              <Slider
                label="Interval"
                hint="seconds between changes"
                min={1.5}
                max={10}
                step={0.5}
                format={(v) => `${v.toFixed(1)}s`}
                value={hero.roles.interval}
                onChange={(v) => setHero((c) => ({ ...c, roles: { ...c.roles, interval: v } }))}
              />
            </div>
          </Section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <Section title="Preview">
            <div className={`${card} mb-3 flex items-center gap-2 px-4 py-3 text-sm font-black uppercase tracking-widest`}>
              3SKRINO<sup className="font-mono text-[8px] font-normal text-white/40">™</sup>
              <span className="text-white/30">—</span>
              <span className="font-mono text-[10px] font-normal tracking-widest text-white/60">
                <RoleCycler roles={hero.roles} />
              </span>
            </div>
            <div className={`${card} flex min-h-64 items-center justify-center overflow-hidden px-4 py-10`}>
              <MidRoleCycler roles={hero.roles} className="text-[clamp(2.5rem,6vw,5rem)]" />
            </div>
            <p className={`${micro} mt-2 text-white/35`}>nav descriptor · mid-screen line (after the hero scrolls away)</p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
