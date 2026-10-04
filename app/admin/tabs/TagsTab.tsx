"use client";

import { useMemo, useState } from "react";
import { btn, btnDanger, card, Empty, input, micro, Section, TabHeader } from "@/components/admin/ui";
import type { Project } from "@/data/projects";

type Props = {
  projects: Project[];
  /** Renames `from` to `to` (empty `to` removes the tag) on every project that has it — one commit. */
  onRetag: (from: string, to: string, ids: string[]) => Promise<void>;
};

/** Every tag across the projects: rename, merge into another, or remove — each in one commit. */
export default function TagsTab({ projects, onRetag }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const tags = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      for (const t of new Set((p.tags ?? []).map((x) => x.toLowerCase()))) {
        if (!map.has(t)) map.set(t, []);
        map.get(t)?.push(p);
      }
    }
    return [...map.entries()].map(([tag, list]) => ({ tag, list })).sort((a, b) => b.list.length - a.list.length || a.tag.localeCompare(b.tag));
  }, [projects]);
  const untagged = projects.filter((p) => !p.tags?.length).length;
  const shown = tags.filter((t) => !query || t.tag.includes(query.toLowerCase()));

  const run = async (from: string, to: string, list: Project[]) => {
    setBusy(from);
    try {
      await onRetag(from, to, list.map((p) => p.id));
      setEditing(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <TabHeader title="Tags" hint={`${tags.length} tags across ${projects.length} projects · ${untagged} untagged · tags feed search and the AI suggestions`} />
      <Section
        title="All tags"
        help="Rename changes the tag on every project that has it. Renaming onto a tag that already exists merges the two. Remove takes it off every project."
        aside={<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter tags…" className={`${input} w-48`} aria-label="Filter tags" />}
      >
        {!shown.length && <Empty>{query ? "No tag matches" : "No tags yet — add them in a project's editor"}</Empty>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {shown.map(({ tag, list }) => (
            <li key={tag} className={`${card} flex flex-col gap-2 p-3`}>
              <div className="flex items-center gap-3">
                {editing === tag ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const to = draft.trim().toLowerCase();
                      if (to && to !== tag) void run(tag, to, list);
                    }}
                  >
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className={input} aria-label={`Rename ${tag}`} maxLength={40} list="tag-names" />
                    <button type="submit" className={btn} disabled={busy !== null || !draft.trim() || draft.trim().toLowerCase() === tag}>
                      {tags.some((t) => t.tag === draft.trim().toLowerCase() && t.tag !== tag) ? "Merge" : "Rename"}
                    </button>
                    <button type="button" className={btn} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="border border-white/20 px-2 py-0.5 font-mono text-xs">#{tag}</span>
                    <span className={`${micro} text-white/40`}>
                      {list.length} project{list.length === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto flex gap-1.5">
                      <button
                        type="button"
                        className={btn}
                        disabled={busy !== null}
                        onClick={() => {
                          setEditing(tag);
                          setDraft(tag);
                        }}
                      >
                        {busy === tag ? "Saving…" : "Rename / merge"}
                      </button>
                      <button
                        type="button"
                        className={btnDanger}
                        disabled={busy !== null}
                        onClick={() => window.confirm(`Remove #${tag} from ${list.length} project(s)?`) && void run(tag, "", list)}
                      >
                        Remove
                      </button>
                    </span>
                  </>
                )}
              </div>
              <p className="truncate text-xs text-white/45" title={list.map((p) => p.title).join(", ")}>
                {list.map((p) => p.title).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
        <datalist id="tag-names">
          {tags.map((t) => (
            <option key={t.tag} value={t.tag} />
          ))}
        </datalist>
      </Section>
    </div>
  );
}
