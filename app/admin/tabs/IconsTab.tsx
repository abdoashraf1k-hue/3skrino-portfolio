"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { slugify, uniqueId } from "@/components/admin/fields";
import { btn, card, Empty, input, micro, Section, Segmented, TabHeader } from "@/components/admin/ui";
import type { BrandIcon, IconSource } from "@/data/brand";
import { assertLogoFile, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { IconView } from "@/lib/brand";
import { useConfigStore } from "../store";

/** Pinned so a library update can never change an icon on the live site. */
const LUCIDE = "https://unpkg.com/lucide-static@0.469.0";
const HEROICONS = "https://unpkg.com/heroicons@2.2.0/24/outline";
const SHOW = 120;

type Library = "lucide" | "heroicons";
type LibIcon = { name: string; tags: string[]; url: string };

const cache = new Map<Library, LibIcon[]>();

async function loadLibrary(lib: Library): Promise<LibIcon[]> {
  const hit = cache.get(lib);
  if (hit) return hit;
  let icons: LibIcon[];
  if (lib === "lucide") {
    const tags = (await (await fetch(`${LUCIDE}/tags.json`)).json()) as Record<string, string[]>;
    icons = Object.entries(tags).map(([name, t]) => ({ name, tags: t, url: `${LUCIDE}/icons/${name}.svg` }));
  } else {
    const meta = (await (await fetch(`${HEROICONS}/?meta`)).json()) as { files: { path: string }[] };
    icons = meta.files
      .map((f) => /\/([\w-]+)\.svg$/.exec(f.path)?.[1])
      .filter((n): n is string => Boolean(n))
      .map((name) => ({ name, tags: name.split("-"), url: `${HEROICONS}/${name}.svg` }));
  }
  cache.set(lib, icons);
  return icons;
}

const sourceLabel: Record<IconSource, string> = { lucide: "Lucide", heroicons: "Heroicons", upload: "Upload", glyph: "Glyph" };

/** admin → Icons: the brand's icon set. Anything can reference one as "icon:<id>". */
export default function IconsTab({ adminKey, onError }: { adminKey: string; onError: (m: string) => void }) {
  const { brand, setBrand } = useConfigStore();
  const [lib, setLib] = useState<Library>("lucide");
  const [libIcons, setLibIcons] = useState<LibIcon[] | null>(null);
  const [libError, setLibError] = useState("");
  const [q, setQ] = useState("");
  const [glyph, setGlyph] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let alive = true;
    loadLibrary(lib).then(
      (icons) => {
        if (!alive) return;
        setLibIcons(icons);
        setLibError("");
      },
      () => alive && setLibError("Couldn't reach the icon library — check the connection and retry"),
    );
    return () => {
      alive = false;
    };
  }, [lib]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = libIcons ?? [];
    return (needle ? all.filter((i) => i.name.includes(needle) || i.tags.some((t) => t.includes(needle))) : all).slice(0, SHOW);
  }, [libIcons, q]);

  if (!brand) return null;
  const icons = brand.icons;
  const taken = new Set(icons.map((i) => i.id));
  const setIcons = (fn: (l: BrandIcon[]) => BrandIcon[]) => setBrand((c) => ({ ...c, icons: fn(c.icons) }));
  const addIcon = (icon: Omit<BrandIcon, "id">, base: string) => setIcons((l) => [...l, { ...icon, id: uniqueId(slugify(base, "icon"), new Set(l.map((x) => x.id))) }]);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    setBusy(true);
    for (const file of files) {
      try {
        assertLogoFile(file);
        const name = file.name.replace(/\.[a-z0-9]+$/i, "");
        const url = await uploadHeroAsset(file, "brands", `icon-${name}`, adminKey);
        addIcon({ name, source: "upload", value: url }, name);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setBusy(false);
  };

  const needle = filter.trim().toLowerCase();
  const mine = icons.filter((i) => !needle || i.id.includes(needle) || i.name.toLowerCase().includes(needle));

  return (
    <div>
      <TabHeader
        title="Icons"
        hint='the brand icon set · roles, categories and any icon picker use "icon:<id>" · SVGs take the text colour'
        actions={
          <label className={`${btn} cursor-pointer border-[#e7fe55]/40 text-[#e7fe55]`}>
            {busy ? "Uploading…" : "+ Upload SVG / PNG"}
            <input type="file" multiple accept="image/svg+xml,image/png,image/webp" className="sr-only" onChange={(e) => void upload(e)} />
          </label>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <Section title={`Your icons (${icons.length})`} aside={<input className={`${input} w-48`} type="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter your icons" />}>
          {!icons.length ? (
            <Empty>No icons yet — pick from the library or upload</Empty>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {mine.map((icon) => (
                <li key={icon.id} className={`${card} flex items-center gap-3 p-2`}>
                  <span className="flex size-10 shrink-0 items-center justify-center bg-black/40 text-white">
                    <IconView icon={icon} size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <input aria-label="Icon name" className={`${input} py-1`} value={icon.name} maxLength={40} onChange={(e) => setIcons((l) => l.map((x) => (x.id === icon.id ? { ...x, name: e.target.value } : x)))} />
                    <span className={`${micro} mt-0.5 block text-[9px] text-white/35`}>
                      icon:{icon.id} · {sourceLabel[icon.source]}
                    </span>
                  </span>
                  <button type="button" className={btn} onClick={() => void navigator.clipboard?.writeText(`icon:${icon.id}`)} title="Copy reference">
                    Copy
                  </button>
                  <button type="button" className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff6b6b]`} aria-label={`Delete ${icon.name}`} onClick={() => setIcons((l) => l.filter((x) => x.id !== icon.id))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className={`${card} mt-4 flex items-center gap-2 p-2`}
            onSubmit={(e) => {
              e.preventDefault();
              const g = glyph.trim();
              if (!g) return;
              addIcon({ name: `Glyph ${g}`, source: "glyph", value: g }, `glyph-${g.codePointAt(0)?.toString(16) ?? "x"}`);
              setGlyph("");
            }}
          >
            <span className="text-sm text-white/60">Add a glyph</span>
            <input className={`${input} w-20 text-center text-lg`} maxLength={8} value={glyph} placeholder="✦" onChange={(e) => setGlyph(e.target.value)} aria-label="Glyph" />
            <button type="submit" className={btn} disabled={!glyph.trim()}>
              Add
            </button>
          </form>
        </Section>

        <aside className="min-w-0">
          <Section title="Library" hint="pinned versions: lucide-static 0.469 · heroicons 2.2 outline">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Segmented<Library>
                label="Library"
                value={lib}
                options={[
                  { value: "lucide", label: "Lucide" },
                  { value: "heroicons", label: "Heroicons" },
                ]}
                onChange={(v) => {
                  setLibIcons(cache.get(v) ?? null);
                  setLib(v);
                }}
              />
              <input className={`${input} min-w-40 flex-1`} type="search" placeholder="Search icons… (film, play, star)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the icon library" />
            </div>
            {libError ? (
              <p className={`${micro} text-[#ff6b6b]`}>{libError}</p>
            ) : libIcons === null ? (
              <p className={`${micro} py-10 text-center text-white/40`}>Loading {lib}…</p>
            ) : (
              <>
                <ul className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                  {results.map((i) => {
                    const added = icons.some((x) => x.value === i.url);
                    return (
                      <li key={i.name}>
                        <button
                          type="button"
                          title={i.name}
                          disabled={added}
                          onClick={() => addIcon({ name: i.name.replace(/-/g, " "), source: lib, value: i.url }, taken.has(i.name) ? `${lib}-${i.name}` : i.name)}
                          className={`flex aspect-square w-full items-center justify-center border text-white/80 transition-colors ${added ? "border-[#e7fe55]/60 text-[#e7fe55]" : "border-white/10 hover:border-white/40 hover:text-white"}`}
                        >
                          <IconView icon={{ id: i.name, name: i.name, source: lib, value: i.url }} size={20} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className={`${micro} mt-2 text-white/35`}>
                  {results.length === SHOW ? `First ${SHOW} — narrow the search` : `${results.length} icons`} · click to add
                </p>
              </>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
