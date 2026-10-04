"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaResponse } from "@/app/api/admin/media/route";
import { ago, btn, card, Empty, input, Loading, micro, Segmented, TabHeader } from "@/components/admin/ui";
import { AuthError, adminFetch } from "@/lib/admin/client-api";
import type { LogEntry } from "@/lib/admin/logs";

type Kind = "edit" | "project" | "backup" | "restore" | "revert" | "upload";
type Entry = { id: string; at: string; kind: Kind; text: string; detail: string; href?: string };

const KIND_STYLE: Record<Kind, { label: string; dot: string }> = {
  edit: { label: "Settings", dot: "bg-[#e7fe55]" },
  project: { label: "Projects", dot: "bg-[#3dd9ff]" },
  backup: { label: "Backups", dot: "bg-[#3dffb0]" },
  restore: { label: "Restores", dot: "bg-[#ffb54d]" },
  revert: { label: "Undos", dot: "bg-[#ff6b6b]" },
  upload: { label: "Uploads", dot: "bg-[#c9a3ff]" },
};

const PAST: Record<string, string> = {
  update: "edited",
  add: "added",
  create: "created",
  delete: "deleted",
  duplicate: "duplicated",
  feature: "featured",
  unfeature: "unfeatured",
  move: "moved",
  reorder: "reordered",
  rename: "renamed",
  remove: "removed",
  reset: "reset",
};

/** "admin: update hero effects, roles" → "You edited hero effects, roles". */
function describe(entry: LogEntry): Entry {
  const subject = entry.message.split("\n")[0];
  const [prefix, ...restParts] = subject.split(":");
  const rest = restParts.join(":").trim();
  const base = { id: entry.sha, at: entry.date, detail: `${entry.author} · ${entry.sha.slice(0, 7)}`, href: entry.url };
  switch (entry.kind) {
    case "backup":
      return { ...base, kind: "backup", text: /scheduled/i.test(rest) ? `Automatic backup ran (${rest.replace(/ snapshot$/, "")})` : "You backed up every data file" };
    case "restore":
      return { ...base, kind: "restore", text: `You restored ${rest}` };
    case "revert":
      return { ...base, kind: "revert", text: `You undid "${rest.replace(/^admin:\s*/, "")}"` };
    default: {
      const [verb, ...words] = rest.split(" ");
      const tail = words.join(" ").replace(/^project — /, "project “").replace(/(“[^”]+)$/, "$1”");
      const isProject = /project|tag/.test(rest) && !/hero|theme|layout|cinematic|effects/.test(rest);
      return { ...base, kind: isProject ? "project" : "edit", text: `You ${PAST[verb] ?? verb} ${tail}`.trim() || prefix };
    }
  }
}

type Props = { adminKey: string; onAuthError: () => void };

/** A timeline of everything done through the admin: saves, project changes, backups, restores, undos and uploads. */
export default function ActivityTab({ adminKey, onAuthError }: Props) {
  const [events, setEvents] = useState<Entry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const [log, media] = await Promise.all([
        adminFetch<{ entries: LogEntry[] }>(adminKey, "logs", "GET"),
        adminFetch<MediaResponse>(adminKey, "media?limit=60", "GET").catch((err: unknown) => {
          if (err instanceof AuthError) throw err;
          return null; // Blob not configured — commits alone still tell the story
        }),
      ]);
      const uploads: Entry[] = (media?.items ?? []).map((m) => ({
        id: m.url,
        at: m.uploadedAt,
        kind: "upload",
        text: `You uploaded ${decodeURIComponent(m.pathname.split("/").pop() ?? m.pathname)}`,
        detail: `${m.folder} · Vercel Blob`,
        href: m.url,
      }));
      setNote(media ? "" : "Uploads aren't listed — Vercel Blob isn't configured");
      setEvents([...log.entries.map(describe), ...uploads].sort((a, b) => b.at.localeCompare(a.at)));
      setNow(Date.now());
      setState("ready");
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError(err instanceof Error ? err.message : "Couldn't load activity");
      setState("error");
    }
  }, [adminKey, onAuthError]);

  useEffect(() => {
    const id = requestAnimationFrame(() => void load());
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      cancelAnimationFrame(id);
      window.clearInterval(tick);
    };
  }, [load]);

  const shown = useMemo(
    () =>
      events.filter(
        (e) => (filter === "all" || e.kind === filter) && (!query || `${e.text} ${e.detail}`.toLowerCase().includes(query.toLowerCase())),
      ),
    [events, filter, query],
  );

  // Group by day.
  const days = useMemo(() => {
    const out: { day: string; items: Entry[] }[] = [];
    for (const e of shown) {
      const day = new Date(e.at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [shown]);

  const counts = useMemo(() => {
    const c: Partial<Record<Kind, number>> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  return (
    <div>
      <TabHeader
        title="Activity"
        hint="everything done in the admin, newest first · from the GitHub history (saves, backups, restores, undos) and Vercel Blob (uploads)"
        actions={
          <button type="button" className={btn} onClick={() => void load()}>
            ↻ Refresh
          </button>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented<Kind | "all">
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${events.length})` },
            ...(Object.keys(KIND_STYLE) as Kind[]).map((k) => ({ value: k, label: `${KIND_STYLE[k].label} (${counts[k] ?? 0})` })),
          ]}
        />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activity…" className={`${input} max-w-xs`} aria-label="Search activity" />
        {note && <span className={`${micro} text-white/35`}>{note}</span>}
      </div>

      {state === "loading" && <Loading what="activity" />}
      {state === "error" && <p className="py-16 text-center text-sm text-[#ff6b6b]">{error}</p>}
      {state === "ready" && !shown.length && <Empty>{query || filter !== "all" ? "Nothing matches" : "No admin activity yet"}</Empty>}

      {state === "ready" &&
        days.map((d) => (
          <section key={d.day} className="mb-8">
            <h2 className={`${micro} mb-3 text-white/40`}>{d.day}</h2>
            <ol className="relative ml-1.5 border-l border-white/10">
              {d.items.map((e) => (
                <li key={e.id} className="relative pb-3 pl-6">
                  <span className={`absolute -left-[4.5px] top-3 size-2 rounded-full ${KIND_STYLE[e.kind].dot}`} />
                  <div className={`${card} flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2`}>
                    <span className="min-w-0 flex-1 text-sm">{e.text}</span>
                    <span className={`${micro} text-[9px] text-white/35`}>
                      {KIND_STYLE[e.kind].label} · {e.detail}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-white/50" title={new Date(e.at).toLocaleString()}>
                      {ago(e.at, now || undefined)}
                    </span>
                    {e.href && (
                      <a href={e.href} target="_blank" rel="noreferrer" className={`${micro} text-white/35 hover:text-white`}>
                        ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
    </div>
  );
}
