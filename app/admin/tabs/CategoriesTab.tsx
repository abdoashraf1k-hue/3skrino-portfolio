"use client";

import { useState } from "react";
import { slugify, uniqueId } from "@/components/admin/fields";
import ReorderList from "@/components/admin/ReorderList";
import { btn, card, ColorField, Empty, input, micro, Section, TabHeader, Toggle } from "@/components/admin/ui";
import type { CategoryDef } from "@/data/brand";
import type { Project } from "@/data/projects";
import { useConfigStore } from "../store";

const SLUG_HINT = "lowercase letters, digits, dashes · the URL: /work/<slug>";

/**
 * admin → Categories: name, slug, description, colour, emoji, order and an
 * on/off switch for every field the work is filed under. A slug is fixed once
 * projects use it (renaming it would orphan them) — disable instead.
 */
export default function CategoriesTab({ projects }: { projects: Project[] }) {
  const { brand, setBrand, site } = useConfigStore();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  if (!brand) return null;

  const list = brand.categories;
  const used = (id: string) => projects.filter((p) => p.category === id).length;
  const setList = (fn: (l: CategoryDef[]) => CategoryDef[]) => setBrand((c) => ({ ...c, categories: fn(c.categories) }));
  const patch = (id: string, v: Partial<CategoryDef>) => setList((l) => l.map((c) => (c.id === id ? { ...c, ...v } : c)));
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const id = uniqueId(slugify(n, "category"), new Set(list.map((c) => c.id)));
    setList((l) => [...l, { id, name: n, description: "", color: "#e7fe55", emoji: "✦", enabled: true }]);
    setName("");
    setOpen(id);
  };
  const override = (id: string) => site?.theme.categoryColors[id];

  return (
    <div>
      <TabHeader
        title="Categories"
        hint="the fields your work is filed under · order here is the order on the site · Theme → Palettes can recolour each one"
      />
      <form
        className="mb-6 flex max-w-lg gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className={input} value={name} maxLength={40} placeholder="New category name (e.g. Furniture)" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className={`${btn} border-[#e7fe55]/40 text-[#e7fe55]`} disabled={!name.trim()}>
          + Add
        </button>
      </form>

      <Section title={`${list.length} categories`} hint={`${list.filter((c) => c.enabled).length} on the site · drag ⋮⋮ to reorder`}>
        {!list.length ? (
          <Empty>No categories — add one above</Empty>
        ) : (
          <ReorderList
            label="Categories"
            handle
            items={list}
            getId={(c) => c.id}
            onChange={(next) => setList(() => next)}
            className="flex flex-col gap-1.5"
            render={(c, i, move) => {
              const count = used(c.id);
              const isOpen = open === c.id;
              const color = override(c.id) ?? c.color;
              return (
                <div className={`${card} ${c.enabled ? "" : "opacity-55"}`}>
                  <div className="flex flex-wrap items-center gap-3 p-2">
                    <span data-drag-handle className="cursor-grab select-none px-1 text-white/30 active:cursor-grabbing" aria-hidden>
                      ⋮⋮
                    </span>
                    <span className="w-5 font-mono text-[10px] tabular-nums text-white/30">{i + 1}</span>
                    <span className="flex size-8 items-center justify-center text-base" style={{ background: `${color}22`, color }}>
                      {c.emoji || "•"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.name}</span>
                      <span className={`${micro} text-[9px] text-white/35`}>
                        /{c.id} · {count} project{count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="flex gap-1">
                      <button type="button" className={btn} aria-pressed={c.enabled} onClick={() => patch(c.id, { enabled: !c.enabled })}>
                        {c.enabled ? "On" : "Off"}
                      </button>
                      <button type="button" className={btn} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)}>
                        {isOpen ? "Close" : "Edit"}
                      </button>
                      <button type="button" className={btn} aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(-1)}>
                        ↑
                      </button>
                      <button type="button" className={btn} aria-label={`Move ${c.name} down`} disabled={i === list.length - 1} onClick={() => move(1)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff6b6b]`}
                        disabled={count > 0 || list.length <= 1}
                        title={count > 0 ? "Projects use this category — move them or switch it off" : undefined}
                        onClick={() => setList((l) => l.filter((x) => x.id !== c.id))}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  {isOpen && (
                    <div className="grid gap-3 border-t border-white/10 p-3 md:grid-cols-2">
                      <label className="block">
                        <span className={`${micro} mb-1 block text-white/50`}>Name</span>
                        <input className={input} value={c.name} maxLength={40} onChange={(e) => patch(c.id, { name: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className={`${micro} mb-1 block text-white/50`}>Slug</span>
                        <input
                          className={`${input} font-mono`}
                          value={c.id}
                          maxLength={40}
                          disabled={count > 0}
                          onChange={(e) => {
                            const next = slugify(e.target.value, c.id);
                            if (list.some((x) => x.id === next && x !== c)) return;
                            setList((l) => l.map((x) => (x.id === c.id ? { ...x, id: next } : x)));
                            setOpen(next);
                          }}
                        />
                        <span className={`${micro} mt-1 block text-[9px] text-white/30`}>{count > 0 ? "locked — projects use it" : SLUG_HINT}</span>
                      </label>
                      <label className="block md:col-span-2">
                        <span className={`${micro} mb-1 block text-white/50`}>Description</span>
                        <textarea rows={2} className={input} value={c.description} maxLength={300} onChange={(e) => patch(c.id, { description: e.target.value })} />
                      </label>
                      <ColorField label={override(c.id) ? "Colour (Theme overrides it)" : "Colour"} value={c.color} onChange={(color) => patch(c.id, { color })} />
                      <label className={`${card} flex items-center gap-3 px-3 py-2`}>
                        <span className="text-sm">Emoji / glyph</span>
                        <input className={`${input} w-20 text-center text-lg`} value={c.emoji} maxLength={8} onChange={(e) => patch(c.id, { emoji: e.target.value })} />
                      </label>
                      <Toggle label="Shown on the site" checked={c.enabled} onChange={(enabled) => patch(c.id, { enabled })} hint="off → hidden from lists, its page 404s" />
                    </div>
                  )}
                </div>
              );
            }}
          />
        )}
      </Section>
    </div>
  );
}
