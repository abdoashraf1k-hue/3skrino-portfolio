"use client";

import type { ReactNode } from "react";
import { btn, card, Help, input, micro, Section, TabHeader } from "@/components/admin/ui";
import { LUT_LABELS } from "@/components/fx/lut";
import { ASPECT_RATIOS, ENTRY_ANIMATIONS, LUT_PRESETS } from "@/data/cinematic-defaults";
import { SECTION_LABELS, type AspectRatio, type EntryAnimation, type LutPreset, type SectionFx, type SectionId } from "@/data/site-config";
import { useConfigStore } from "../store";

/**
 * Per-section cinematic overrides: each home section can carry its own
 * entrance, aspect-ratio matte, colour grade, CRT, chromatic aberration and
 * depth of field — on top of (or instead of) the global effects.
 */
export default function SectionsTab() {
  const { site, setSite } = useConfigStore();
  if (!site) return null;
  const fx = site.cinematic.sections;
  const order = site.layout.sections;

  const patch = (id: SectionId, change: Partial<Record<keyof SectionFx, SectionFx[keyof SectionFx] | undefined>>) =>
    setSite((s) => {
      const cur: SectionFx = { ...(s.cinematic.sections[id] ?? {}) };
      for (const [k, v] of Object.entries(change) as [keyof SectionFx, SectionFx[keyof SectionFx] | undefined][]) {
        if (v === undefined || v === 0 || v === false) delete cur[k];
        else (cur as Record<string, unknown>)[k] = v;
      }
      const next = { ...s.cinematic.sections };
      if (Object.keys(cur).length) next[id] = cur;
      else delete next[id];
      return { ...s, cinematic: { ...s.cinematic, sections: next } };
    });
  const clear = (id: SectionId) =>
    setSite((s) => {
      const next = { ...s.cinematic.sections };
      delete next[id];
      return { ...s, cinematic: { ...s.cinematic, sections: next } };
    });

  const overridden = Object.keys(fx).length;

  return (
    <div>
      <TabHeader
        title="Sections"
        hint={`per-section cinematic overrides · ${overridden} section${overridden === 1 ? "" : "s"} customised · order and visibility live in admin → Layout`}
      />
      <Section
        title="Home sections"
        help="Every column is optional — blank follows the global setting. Letterbox and depth of field apply while the section is centred on screen; the grade applies to that section's images and videos."
        onReset={overridden ? () => setSite((s) => ({ ...s, cinematic: { ...s.cinematic, sections: {} } })) : undefined}
      >
        <div className="flex flex-col gap-2">
          {order.map(({ id, visible }) => {
            const f = fx[id] ?? {};
            const custom = Object.keys(f).length > 0;
            return (
              <div key={id} className={`${card} grid items-end gap-3 p-3 md:grid-cols-2 xl:grid-cols-[150px_repeat(6,minmax(0,1fr))_auto] ${custom ? "border-[#e7fe55]/30" : ""}`}>
                <div className="self-center">
                  <p className="text-sm font-bold uppercase tracking-tight">{SECTION_LABELS[id]}</p>
                  <p className={`${micro} text-[9px] text-white/35`}>{visible ? (custom ? "customised" : "follows global") : "hidden in Layout"}</p>
                </div>
                <Cell label="Entrance">
                  <select value={f.entry ?? ""} onChange={(e) => patch(id, { entry: (e.target.value || undefined) as EntryAnimation | undefined })} className={input}>
                    <option value="">Global</option>
                    {ENTRY_ANIMATIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Cell>
                <Cell label="Letterbox">
                  <select value={f.letterbox ?? ""} onChange={(e) => patch(id, { letterbox: (e.target.value || undefined) as AspectRatio | undefined })} className={input}>
                    <option value="">Off</option>
                    {ASPECT_RATIOS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Cell>
                <Cell label="Grade">
                  <select value={f.lut ?? ""} onChange={(e) => patch(id, { lut: (e.target.value || undefined) as LutPreset | undefined })} className={input}>
                    <option value="">Global</option>
                    {LUT_PRESETS.map((v) => (
                      <option key={v} value={v}>
                        {LUT_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </Cell>
                <Cell label="CRT">
                  <select value={f.crt ? "on" : ""} onChange={(e) => patch(id, { crt: e.target.value === "on" || undefined })} className={input}>
                    <option value="">Off</option>
                    <option value="on">On</option>
                  </select>
                </Cell>
                <Cell label={`Chromatic ${f.chromatic ? `${Math.round(f.chromatic * 100)}%` : "off"}`}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={f.chromatic ?? 0}
                    onChange={(e) => patch(id, { chromatic: Number(e.target.value) || undefined })}
                    className="w-full accent-[#e7fe55]"
                  />
                </Cell>
                <Cell label={`Depth blur ${f.dof ? `${f.dof}px` : "off"}`}>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.5}
                    value={f.dof ?? 0}
                    onChange={(e) => patch(id, { dof: Number(e.target.value) || undefined })}
                    className="w-full accent-[#e7fe55]"
                  />
                </Cell>
                <button type="button" className={btn} disabled={!custom} onClick={() => clear(id)} title="Back to global">
                  ↺
                </button>
              </div>
            );
          })}
        </div>
        <p className={`${micro} mt-3 flex items-center gap-2 text-white/35`}>
          <Help>The hero isn&apos;t listed: it has its own controls in admin → Heroes and Poses. Use an effect&apos;s &quot;Hero&quot; scope (admin → Effects) to aim it at the hero.</Help>
          where&apos;s the hero?
        </p>
      </Section>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={`${micro} mb-1 block text-[9px] text-white/45`}>{label}</span>
      {children}
    </label>
  );
}
