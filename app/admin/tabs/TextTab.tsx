"use client";

import { useMemo, useRef, useState } from "react";
import { btn, card, Empty, input, micro, Section, TabHeader } from "@/components/admin/ui";
import { TEXT_REGISTRY, type TextEntry } from "@/data/text-registry";
import { parseHeadline } from "@/lib/brand";
import { useConfigStore } from "../store";

const title = (s: string) => s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/** The headline as the site will set it: line breaks + the editorial accent. */
function HeadlinePreview({ value }: { value: string }) {
  return (
    <p className="font-black uppercase leading-[0.9] tracking-tight text-2xl">
      {parseHeadline(value).map((part, i) =>
        typeof part === "string" ? (
          <span key={i} className="block">
            {part}
          </span>
        ) : (
          <span key={i} className="block italic text-[#e7fe55]">
            {part.text}
          </span>
        ),
      )}
    </p>
  );
}

function Editor({ entry, value, overridden, onChange, onReset }: { entry: TextEntry; value: string; overridden: boolean; onChange: (v: string) => void; onReset: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Wrap the selection in *…* (the editorial accent). */
  const accent = () => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    if (a === b) return;
    onChange(`${value.slice(0, a)}*${value.slice(a, b)}*${value.slice(b)}`);
  };
  const lineBreak = () => {
    const el = ref.current;
    const at = el ? el.selectionStart : value.length;
    onChange(`${value.slice(0, at).trimEnd()} / ${value.slice(at).trimStart()}`);
  };
  const rows = entry.multiline ? 4 : entry.headline ? 2 : 1;
  return (
    <div className={`${card} p-3 ${overridden ? "border-[#e7fe55]/30" : ""}`}>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          {entry.label}
          <span className={`${micro} ml-2 text-[9px] text-white/30`}>{entry.key}</span>
        </span>
        <span className="flex gap-1">
          {entry.headline && (
            <>
              <button type="button" className={btn} onClick={accent} title="Select words, then set them in the accent (italic + colour)">
                <em>Accent</em>
              </button>
              <button type="button" className={btn} onClick={lineBreak} title="Break the line at the cursor">
                ↵ Line
              </button>
            </>
          )}
          <button type="button" className={btn} disabled={!overridden} onClick={onReset}>
            ↺ Default
          </button>
        </span>
      </div>
      <textarea ref={ref} rows={rows} className={`${input} resize-y`} value={value} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
      {entry.headline && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <HeadlinePreview value={value} />
        </div>
      )}
      {overridden && <p className={`${micro} mt-1 text-[9px] text-white/30`}>default: {entry.default}</p>}
    </div>
  );
}

/** admin → Text: every heading, paragraph, CTA and label, as page → section → key. */
export default function TextTab() {
  const { brand, setBrand } = useConfigStore();
  const [q, setQ] = useState("");
  const [page, setPage] = useState<string | null>(null);

  const tree = useMemo(() => {
    const pages = new Map<string, Map<string, TextEntry[]>>();
    for (const e of TEXT_REGISTRY) {
      const sections = pages.get(e.page) ?? new Map<string, TextEntry[]>();
      sections.set(e.section, [...(sections.get(e.section) ?? []), e]);
      pages.set(e.page, sections);
    }
    return pages;
  }, []);

  if (!brand) return null;
  const overrides = brand.text;
  const needle = q.trim().toLowerCase();
  const matches = (e: TextEntry) =>
    !needle || [e.key, e.label, e.default, overrides[e.key] ?? ""].some((s) => s.toLowerCase().includes(needle));
  const set = (key: string, v: string) =>
    setBrand((c) => {
      const text = { ...c.text };
      const def = TEXT_REGISTRY.find((e) => e.key === key)?.default;
      // An emptied field stays empty while typing; the save drops it (→ the default).
      if (v === def) delete text[key];
      else text[key] = v;
      return { ...c, text };
    });
  const overriddenCount = Object.keys(overrides).length;
  const shownPages = [...tree.keys()].filter((p) => (page ? p === page : true));

  return (
    <div>
      <TabHeader
        title="Text"
        hint={`${TEXT_REGISTRY.length} strings · ${overriddenCount} edited · headlines: " / " breaks a line, *word* sets the accent`}
        actions={
          overriddenCount > 0 && (
            <button type="button" className={btn} onClick={() => setBrand((c) => ({ ...c, text: {} }))}>
              Reset all text
            </button>
          )
        }
      />
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Pages" className="lg:sticky lg:top-24 lg:self-start">
          <input className={`${input} mb-3`} type="search" placeholder="Search text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search text" />
          <ul className="flex flex-col">
            <li>
              <button type="button" onClick={() => setPage(null)} className={`${micro} w-full px-2 py-1.5 text-left ${page === null ? "text-[#e7fe55]" : "text-white/55 hover:text-white"}`}>
                All pages
              </button>
            </li>
            {[...tree.entries()].map(([p, sections]) => (
              <li key={p}>
                <button type="button" onClick={() => setPage(p)} className={`${micro} w-full px-2 py-1.5 text-left ${page === p ? "text-[#e7fe55]" : "text-white/55 hover:text-white"}`}>
                  {title(p)}
                </button>
                <ul className="mb-1 ml-3 border-l border-white/10">
                  {[...sections.keys()].map((s) => (
                    <li key={s}>
                      <a href={`#text-${p}-${s}`} onClick={() => setPage(p)} className="block px-2 py-0.5 text-[11px] text-white/40 hover:text-white">
                        {title(s)}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {shownPages.map((p) => {
            const sections = [...(tree.get(p) ?? new Map<string, TextEntry[]>()).entries()]
              .map(([s, entries]) => [s, entries.filter(matches)] as const)
              .filter(([, entries]) => entries.length);
            if (!sections.length) return null;
            return (
              <div key={p}>
                {sections.map(([s, entries]) => (
                  <div id={`text-${p}-${s}`} key={s} className="scroll-mt-24">
                    <Section title={`${title(p)} → ${title(s)}`}>
                      <div className="flex flex-col gap-2">
                        {entries.map((e) => (
                          <Editor
                            key={e.key}
                            entry={e}
                            value={overrides[e.key] ?? e.default}
                            overridden={e.key in overrides}
                            onChange={(v) => set(e.key, v)}
                            onReset={() => set(e.key, e.default)}
                          />
                        ))}
                      </div>
                    </Section>
                  </div>
                ))}
              </div>
            );
          })}
          {!TEXT_REGISTRY.some(matches) && <Empty>Nothing matches “{q}”</Empty>}
        </div>
      </div>
    </div>
  );
}
