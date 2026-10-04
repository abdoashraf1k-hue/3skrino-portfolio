"use client";

import Fuse from "fuse.js";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { categories } from "@/data/categories";
import { projectHref, projects } from "@/data/projects";
import { navLinks } from "@/data/site";
import { readStoredKey } from "@/lib/admin/client-api";
import { uiSound } from "@/lib/cinematic";
import { tick, toggleSound, useSoundEnabled } from "@/lib/sound";
import { toggleTheme, useTheme } from "@/lib/theme";
import { cn, EASE_OUT } from "@/lib/utils";

/** Anything can open the palette with `window.dispatchEvent(new Event(OPEN_PALETTE))`. */
export const OPEN_PALETTE = "3skrino:palette";

type Group = "Pages" | "Categories" | "Projects" | "Actions";
type Item = {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  keywords?: string;
  href?: string;
  run?: () => void;
};

const GROUP_ORDER: Group[] = ["Actions", "Pages", "Categories", "Projects"];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const theme = useTheme();
  const sound = useSoundEnabled();
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus?.();
  }, []);

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setOpen(true);
    uiSound("notification");
    tick(520);
  }, []);

  // Ctrl/⌘+K anywhere on the public site (the admin has its own Ctrl/⌘+K search).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      if (document.querySelector("[data-admin-root]")) return;
      e.preventDefault();
      if (open) close();
      else show();
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE, onOpen);
    };
  }, [open, show, close]);

  const items = useMemo<Item[]>(
    () => [
      {
        id: "a-theme",
        group: "Actions",
        label: theme === "light" ? "Switch to dark theme" : "Switch to light theme",
        hint: "Theme",
        keywords: "toggle theme dark light mode appearance",
        run: toggleTheme,
      },
      {
        id: "a-sound",
        group: "Actions",
        label: sound ? "Turn UI sound off" : "Turn UI sound on",
        hint: "Sound",
        keywords: "toggle sound audio mute",
        run: () => void toggleSound(),
      },
      {
        id: "a-search",
        group: "Actions",
        label: "Search all work…",
        hint: "/search",
        keywords: "find search",
        href: "/search",
      },
      {
        id: "a-admin",
        group: "Actions",
        label: "Open admin",
        hint: "Owner only",
        keywords: "admin cms dashboard manage",
        run: () => {
          const key = readStoredKey() || window.prompt("Admin key") || "";
          if (key) router.push(`/admin?key=${encodeURIComponent(key)}`);
        },
      },
      { id: "p-home", group: "Pages", label: "Home", href: "/", keywords: "index start" },
      ...navLinks.map((l) => ({ id: `p-${l.href}`, group: "Pages" as const, label: l.label, href: l.href })),
      { id: "p-feed", group: "Pages", label: "RSS feed", href: "/feed.xml", hint: "feed.xml", keywords: "rss subscribe" },
      ...categories.map((c) => ({
        id: `c-${c.id}`,
        group: "Categories" as const,
        label: c.name,
        hint: `${c.count} ${c.count === 1 ? "project" : "projects"}`,
        keywords: c.description,
        href: `/work/${c.id}`,
      })),
      ...projects.map((p) => ({
        id: `w-${p.id}`,
        group: "Projects" as const,
        label: p.title,
        hint: `${categories.find((c) => c.id === p.category)?.name ?? p.category} · ${p.year}`,
        keywords: [p.client, p.description, ...p.tools, ...(p.tags ?? [])].join(" "),
        href: projectHref(p),
      })),
    ],
    [theme, sound, router],
  );

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: [
          { name: "label", weight: 3 },
          { name: "hint", weight: 1 },
          { name: "keywords", weight: 1 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [items],
  );

  const results = useMemo(() => {
    const q = query.trim();
    const list = q ? fuse.search(q, { limit: 30 }).map((r) => r.item) : items.filter((i) => i.group !== "Projects").concat(items.filter((i) => i.group === "Projects").slice(0, 5));
    // Keep a stable group order so arrow keys move predictably.
    return q ? list : GROUP_ORDER.flatMap((g) => list.filter((i) => i.group === g));
  }, [query, fuse, items]);

  const choose = (item: Item) => {
    tick(780);
    if (item.run) {
      item.run();
      if (item.id !== "a-sound" && item.id !== "a-theme") close();
      return;
    }
    // Click the rendered link so the page transition runs like any other navigation.
    listRef.current?.querySelector<HTMLAnchorElement>(`[data-item="${item.id}"]`)?.click();
    close();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) choose(item);
    }
  };

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Group headers only in the browse view (no query), where results are grouped.
  const headerAt = results.map((item, i) => !query.trim() && (i === 0 || results[i - 1].group !== item.group));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          data-lenis-prevent
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          className="fixed inset-0 z-[110] flex items-start justify-center bg-bg/70 px-4 pt-[12vh] backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            onKeyDown={onKeyDown}
            className="w-full max-w-xl overflow-hidden border border-line bg-bg-soft shadow-[0_40px_120px_-20px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-center gap-3 border-b border-line px-5">
              <span aria-hidden className="font-mono text-accent">⌕</span>
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Search work, pages, actions…"
                aria-label="Search"
                aria-controls="palette-results"
                aria-activedescendant={results[active] ? `pal-${results[active].id}` : undefined}
                role="combobox"
                aria-expanded
                className="h-16 flex-1 bg-transparent text-lg outline-none placeholder:text-muted/70"
              />
              <kbd className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">Esc</kbd>
            </div>

            <ul id="palette-results" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto overscroll-contain py-2">
              {results.length === 0 && (
                <li className="px-5 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-muted">No results for “{query}”</li>
              )}
              {results.map((item, i) => {
                const header = headerAt[i];
                const rowCls = cn(
                  "flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition-colors",
                  i === active ? "bg-fg/[0.06] text-fg" : "text-fg/75",
                );
                const inner = (
                  <>
                    <span className="flex min-w-0 items-center gap-3">
                      <span aria-hidden className={cn("size-1 shrink-0 rounded-full", i === active ? "bg-accent" : "bg-transparent")} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted">{item.hint ?? item.group}</span>
                  </>
                );
                return (
                  <li key={item.id} role="presentation">
                    {header && <p className="px-5 pb-1 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted">{item.group}</p>}
                    {item.href ? (
                      <Link
                        href={item.href}
                        id={`pal-${item.id}`}
                        role="option"
                        aria-selected={i === active}
                        data-index={i}
                        data-item={item.id}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => {
                          tick(780);
                          setOpen(false);
                        }}
                        className={rowCls}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        id={`pal-${item.id}`}
                        role="option"
                        aria-selected={i === active}
                        data-index={i}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(item)}
                        className={rowCls}
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between border-t border-line px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted">
              <span>↑↓ navigate · ↵ open</span>
              <span>Ctrl / ⌘ K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
