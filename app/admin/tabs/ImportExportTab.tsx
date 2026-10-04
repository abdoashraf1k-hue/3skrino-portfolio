"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { btn, btnPrimary, card, micro, Section, TabHeader } from "@/components/admin/ui";
import { withCinematicDefaults } from "@/data/cinematic-defaults";
import type { HeroConfig } from "@/data/hero-config";
import type { Project } from "@/data/projects";
import type { SiteConfig } from "@/data/site-config";
import { useConfigStore } from "../store";

const KIND = "3skrino-export";
type Bundle = { kind: typeof KIND; version: 1; exportedAt: string; projects?: Project[]; hero?: HeroConfig; site?: SiteConfig };
type Loaded = { name: string; hero: HeroConfig | null; site: SiteConfig | null; projects: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const looksHero = (v: unknown): v is HeroConfig => isObj(v) && isObj(v.poses) && isObj(v.features) && isObj(v.roles);
const looksSite = (v: unknown): v is SiteConfig => isObj(v) && isObj(v.theme) && isObj(v.content) && isObj(v.layout);

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

/**
 * Export the projects and both configs as JSON; import a config file (or a
 * full export) back into the drafts. Imports never save by themselves —
 * you review them in the live preview, then Save (the server validates).
 */
export default function ImportExportTab({ projects }: { projects: Project[] }) {
  const { hero, site, setHero, setSite } = useConfigStore();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    const bundle: Bundle = { kind: KIND, version: 1, exportedAt: new Date().toISOString(), projects, hero: hero ?? undefined, site: site ?? undefined };
    download(`3skrino-export-${stamp()}.json`, bundle);
  };

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setLoaded(null);
    try {
      const data: unknown = JSON.parse(await file.text());
      let h: HeroConfig | null = null;
      let s: SiteConfig | null = null;
      let n = 0;
      if (isObj(data) && data.kind === KIND) {
        h = looksHero(data.hero) ? data.hero : null;
        s = looksSite(data.site) ? data.site : null;
        n = Array.isArray(data.projects) ? data.projects.length : 0;
      } else if (looksHero(data)) h = data;
      else if (looksSite(data)) s = data;
      else if (Array.isArray(data)) n = data.length;
      if (!h && !s && !n) throw new Error("That file isn't a 3SKRINO export, hero config or site config");
      setLoaded({ name: file.name, hero: h, site: s, projects: n });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file");
    }
  };

  return (
    <div>
      <TabHeader title="Import / Export" hint="JSON in and out · imports land in the drafts — nothing is saved until you press Save" />

      <Section title="Export" hint="downloads to this computer">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <ExportCard title="Everything" what={`${projects.length} projects + hero + site settings`} primary onClick={exportAll} />
          <ExportCard title="Projects" what={`${projects.length} projects (data/projects.ts)`} onClick={() => download(`3skrino-projects-${stamp()}.json`, projects)} />
          <ExportCard title="Hero settings" what="poses, brands, roles, hero effects" disabled={!hero} onClick={() => download(`3skrino-hero-${stamp()}.json`, hero)} />
          <ExportCard title="Site settings" what="theme, layout, content, SEO, heroes, cinematic" disabled={!site} onClick={() => download(`3skrino-site-${stamp()}.json`, site)} />
        </div>
      </Section>

      <Section
        title="Import"
        hint="a full export, a hero file or a site file"
        help="Hero and site settings load into the drafts so you can check them in the live preview first; Save validates them on the server. Projects aren't imported here — restore data/projects.ts from admin → Backups instead, which keeps a snapshot of what it replaces."
      >
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} onChange={(e) => void pick(e)} />
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          Choose a JSON file…
        </button>
        {error && <p className="mt-3 text-sm text-[#ff6b6b]">{error}</p>}
        {loaded && (
          <div className={`${card} admin-fade mt-4 flex flex-col gap-3 p-4`}>
            <p className="text-sm">
              <span className="font-bold">{loaded.name}</span>
              <span className={`${micro} ml-2 text-white/40`}>
                {[loaded.hero && "hero settings", loaded.site && "site settings", loaded.projects && `${loaded.projects} projects (not imported)`].filter(Boolean).join(" · ")}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {loaded.hero && (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => {
                    if (loaded.hero) setHero(() => loaded.hero as HeroConfig);
                    setLoaded((l) => (l ? { ...l, hero: null } : l));
                  }}
                >
                  Load hero settings into draft
                </button>
              )}
              {loaded.site && (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => {
                    if (loaded.site) setSite(() => withCinematicDefaults(loaded.site as SiteConfig));
                    setLoaded((l) => (l ? { ...l, site: null } : l));
                  }}
                >
                  Load site settings into draft
                </button>
              )}
              <button type="button" className={btn} onClick={() => setLoaded(null)}>
                Cancel
              </button>
            </div>
            <p className={`${micro} text-[9px] text-white/35`}>After loading: check the preview, then Save — or Discard to drop it.</p>
          </div>
        )}
      </Section>
    </div>
  );
}

function ExportCard({ title, what, onClick, primary, disabled }: { title: string; what: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <div className={`${card} flex flex-col gap-3 p-3`}>
      <div>
        <p className="text-sm font-bold uppercase tracking-tight">{title}</p>
        <p className="text-xs text-white/45">{what}</p>
      </div>
      <button type="button" className={`${primary ? btnPrimary : btn} self-start`} disabled={disabled} onClick={onClick}>
        ↓ Download .json
      </button>
    </div>
  );
}
