"use client";

import { useEffect, useMemo, useState } from "react";
import { btn, card, Field, input, micro, Section, TabHeader } from "@/components/admin/ui";
import { projectHref, type Project } from "@/data/projects";
import type { ProjectSeo } from "@/data/site-config";
import { useConfigStore } from "../store";

const HOST = (process.env.NEXT_PUBLIC_SITE_URL || "https://3skrino.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");

/** Google-style truncation by characters (pixel-accurate needs layout; this is the usual ~60 / 160). */
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function GoogleCard({ title, description, path }: { title: string; description: string; path: string }) {
  const crumbs = path === "/" ? "" : path.split("/").filter(Boolean).join(" › ");
  return (
    <div className="max-w-[600px] rounded-lg bg-white p-4 font-[arial,sans-serif] text-left">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#0a0a0a] text-[13px] font-black text-[#e7fe55]">3</span>
        <span className="leading-tight">
          <span className="block text-[14px] text-[#202124]">3SKRINO</span>
          <span className="block text-[12px] text-[#4d5156]">
            https://{HOST}
            {crumbs && ` › ${crumbs}`}
          </span>
        </span>
      </div>
      <p className="text-[20px] leading-[1.3] text-[#1a0dab]">{cut(title, 60)}</p>
      <p className="mt-1 text-[14px] leading-[1.58] text-[#4d5156]">{cut(description, 160)}</p>
    </div>
  );
}

function SocialCard({ title, description, image, kind }: { title: string; description: string; image: string; kind: "x" | "og" }) {
  return (
    <div className={`max-w-[520px] overflow-hidden border ${kind === "x" ? "rounded-2xl border-[#2f3336] bg-black" : "border-[#dadde1] bg-[#f0f2f5]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- preview of the share image */}
      <img src={image} alt="" className="aspect-[1200/630] w-full object-cover" />
      <div className={kind === "x" ? "px-3 py-2" : "border-t border-[#dadde1] px-3 py-2.5"}>
        <p className={`text-[12px] uppercase ${kind === "x" ? "text-[#71767b]" : "text-[#606770]"}`}>{HOST}</p>
        <p className={`truncate text-[15px] font-semibold ${kind === "x" ? "text-[#e7e9ea]" : "text-[#1d2129]"}`}>{title}</p>
        <p className={`line-clamp-2 text-[13px] ${kind === "x" ? "text-[#71767b]" : "text-[#606770]"}`}>{description}</p>
      </div>
    </div>
  );
}

function useText(url: string) {
  const [text, setText] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(
        (t) => alive && setText(t),
        () => alive && setText(""),
      );
    return () => {
      alive = false;
    };
  }, [url, nonce]);
  return { text, refresh: () => setNonce((n) => n + 1) };
}

export default function SeoTab({ projects }: { projects: Project[] }) {
  const { site, setSite } = useConfigStore();
  const sitemap = useText("/sitemap.xml");
  const robots = useText("/robots.txt");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const urls = useMemo(() => [...(sitemap.text ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), [sitemap.text]);

  if (!site) return null;
  const c = site.content;
  const overrides = site.seo.projects;
  const shareImage = c.ogImage || "/opengraph-image";
  const setOverride = (id: string, patch: ProjectSeo) =>
    setSite((s) => {
      const next = { ...s.seo.projects[id], ...patch };
      const projectsSeo = { ...s.seo.projects };
      if (next.title || next.description) projectsSeo[id] = next;
      else delete projectsSeo[id];
      return { ...s, seo: { projects: projectsSeo } };
    });

  const shown = projects.filter((p) => !query || `${p.title} ${p.client} ${p.category}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <TabHeader title="SEO" hint="how the site appears in search and when shared · edit the site title / description in Content · per-project overrides below" />

      <div className="grid gap-x-8 xl:grid-cols-2">
        <Section title="Google" hint="home page, as it would appear">
          <GoogleCard title={c.siteTitle} description={c.siteDescription} path="/" />
        </Section>
        <Section title="Share cards" hint="X / Twitter (top) and Open Graph — Facebook, LinkedIn, iMessage">
          <div className="flex flex-col gap-4">
            <SocialCard kind="x" title={c.siteTitle} description={c.siteDescription} image={shareImage} />
            <SocialCard kind="og" title={c.siteTitle} description={c.siteDescription} image={shareImage} />
          </div>
        </Section>
      </div>

      <Section
        title="Per-project overrides"
        hint="replace a project's search title / description · empty = use the project's own"
        aside={<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter projects…" className={`${input} w-56`} />}
      >
        <ul className="flex flex-col gap-1.5">
          {shown.map((p) => {
            const o = overrides[p.id] ?? {};
            const fallbackDesc = p.description || `${p.title} — ${p.role} for ${p.client}.`;
            const isOpen = open === p.id;
            return (
              <li key={p.id} className={card}>
                <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.title}</span>
                  {(o.title || o.description) && <span className={`${micro} text-[9px] text-[#e7fe55]`}>override</span>}
                  <span className={`${micro} text-[9px] text-white/35`}>{projectHref(p)}</span>
                  <span className="text-white/40">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <div className="grid gap-4 border-t border-white/10 p-3 lg:grid-cols-2">
                    <div className="flex flex-col gap-3">
                      <Field label="Title" counter={[(o.title || p.title).length, 60]}>
                        <input value={o.title ?? ""} placeholder={p.title} maxLength={70} onChange={(e) => setOverride(p.id, { title: e.target.value })} className={input} />
                      </Field>
                      <Field label="Description" counter={[(o.description || fallbackDesc).length, 160]}>
                        <textarea
                          rows={3}
                          value={o.description ?? ""}
                          placeholder={fallbackDesc}
                          maxLength={200}
                          onChange={(e) => setOverride(p.id, { description: e.target.value })}
                          className={input}
                        />
                      </Field>
                    </div>
                    <GoogleCard title={`${o.title || p.title} — 3SKRINO`} description={o.description || fallbackDesc} path={projectHref(p)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="grid gap-x-8 xl:grid-cols-2">
        <Section
          title="Sitemap"
          hint={`/sitemap.xml · ${urls.length} URLs`}
          aside={
            <span className="flex gap-1">
              <button type="button" className={btn} onClick={sitemap.refresh}>
                ↻
              </button>
              <a className={btn} href="/sitemap.xml" target="_blank" rel="noreferrer">
                Open ↗
              </a>
            </span>
          }
        >
          <ul className="max-h-80 overflow-auto border border-white/10 font-mono text-[11px]">
            {sitemap.text === null ? (
              <li className="p-3 text-white/40">Loading…</li>
            ) : urls.length === 0 ? (
              <li className="p-3 text-[#ff6b6b]">Couldn&apos;t read the sitemap</li>
            ) : (
              urls.map((u) => (
                <li key={u} className="truncate border-t border-white/5 px-3 py-1.5 text-white/70 first:border-t-0">
                  {u}
                </li>
              ))
            )}
          </ul>
        </Section>
        <Section
          title="robots.txt"
          aside={
            <span className="flex gap-1">
              <button type="button" className={btn} onClick={robots.refresh}>
                ↻
              </button>
              <a className={btn} href="/robots.txt" target="_blank" rel="noreferrer">
                Open ↗
              </a>
            </span>
          }
        >
          <pre className="max-h-80 overflow-auto border border-white/10 p-3 font-mono text-[11px] leading-relaxed text-white/70">
            {robots.text === null ? "Loading…" : robots.text || "Couldn't read robots.txt"}
          </pre>
        </Section>
      </div>
    </div>
  );
}
