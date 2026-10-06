"use client";

import { useState } from "react";
import { NumberField } from "@/components/admin/fields";
import { btn, input, micro, Section, TabHeader } from "@/components/admin/ui";
import { NUMBER_REGISTRY } from "@/data/number-registry";
import { useConfigStore } from "../store";

const GROUP_LABEL: Record<string, string> = {
  logos: "Brand logo ring",
  home: "Home page",
  confrontation: "Confrontation hero",
  interview: "Interview hero",
  signature: "Signature moments",
};

/** admin → Numbers: every numeric value the site reads, changed in one place. */
export default function NumbersTab() {
  const { brand, setBrand } = useConfigStore();
  const [q, setQ] = useState("");
  if (!brand) return null;

  const needle = q.trim().toLowerCase();
  const shown = NUMBER_REGISTRY.filter((n) => !needle || n.key.toLowerCase().includes(needle) || n.label.toLowerCase().includes(needle));
  const groups = [...new Set(shown.map((n) => n.group))];
  const set = (key: string, v: number, def: number) =>
    setBrand((c) => {
      const numbers = { ...c.numbers };
      if (v === def) delete numbers[key];
      else numbers[key] = v;
      return { ...c, numbers };
    });
  const edited = Object.keys(brand.numbers).length;

  return (
    <div>
      <TabHeader
        title="Numbers"
        hint={`${NUMBER_REGISTRY.length} values · ${edited} edited · each one updates everywhere it's used`}
        actions={
          edited > 0 && (
            <button type="button" className={btn} onClick={() => setBrand((c) => ({ ...c, numbers: {} }))}>
              Reset all numbers
            </button>
          )
        }
      />
      <input className={`${input} mb-6 max-w-sm`} type="search" placeholder="Search numbers…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search numbers" />
      {groups.map((g) => (
        <Section key={g} title={GROUP_LABEL[g] ?? g}>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {shown
              .filter((n) => n.group === g)
              .map((n) => {
                const value = brand.numbers[n.key] ?? n.default;
                return (
                  <div key={n.key}>
                    <NumberField label={n.label} unit={n.unit} min={n.min} max={n.max} step={n.step} value={value} onChange={(v) => set(n.key, v, n.default)} />
                    <p className={`${micro} mt-1 flex justify-between text-[9px] text-white/30`}>
                      <span>{n.key}</span>
                      {n.key in brand.numbers && (
                        <button type="button" className="hover:text-white" onClick={() => set(n.key, n.default, n.default)}>
                          ↺ {n.default}
                        </button>
                      )}
                    </p>
                  </div>
                );
              })}
          </div>
        </Section>
      ))}
    </div>
  );
}
