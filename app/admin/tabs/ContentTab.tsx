"use client";

import { useState, type ChangeEvent } from "react";
import ReorderList from "@/components/admin/ReorderList";
import { btn, card, Field, input, micro, Section, TabHeader } from "@/components/admin/ui";
import type { SiteContent } from "@/data/site-config";
import { assertSiteImage, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { useConfigStore } from "../store";

let seq = 0;
const key = () => `c-${++seq}`;

type Props = { adminKey: string; onError: (m: string) => void };

export default function ContentTab({ adminKey, onError }: Props) {
  const { site, setSite } = useConfigStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [socialKeys, setSocialKeys] = useState<string[]>([]);
  if (!site) return null;
  const c = site.content;
  const set = <K extends keyof SiteContent>(k: K, v: SiteContent[K]) => setSite((s) => ({ ...s, content: { ...s.content, [k]: v } }));

  const upload = async (field: "ogImage" | "favicon", e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      assertSiteImage(file);
      setBusy(field);
      const url = await uploadHeroAsset(file, "site", field === "ogImage" ? "share-image" : "favicon", adminKey);
      set(field, url);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const socials = c.socials.map((s, i) => ({ ...s, id: socialKeys[i] ?? `s-${i}` }));
  const setSocials = (rows: { id: string; label: string; href: string }[]) => {
    setSocialKeys(rows.map((r) => r.id));
    set(
      "socials",
      rows.map(({ label, href }) => ({ label, href })),
    );
  };

  const imageSlot = (field: "ogImage" | "favicon", label: string, hint: string, aspect: string) => (
    <div className={`${card} flex flex-col gap-3 p-3`}>
      <div className={`relative overflow-hidden border border-white/10 bg-black ${aspect}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded / generated image */}
        <img
          src={c[field] || (field === "ogImage" ? "/opengraph-image" : "/icon")}
          alt=""
          className={`absolute inset-0 size-full ${field === "favicon" ? "object-contain p-6 [image-rendering:pixelated]" : "object-cover"}`}
        />
        {busy === field && (
          <span className={`${micro} absolute inset-0 flex items-center justify-center bg-black/70 text-[#e7fe55]`}>Uploading…</span>
        )}
      </div>
      <div>
        <p className="text-sm font-bold uppercase tracking-wide">{label}</p>
        <p className={`${micro} text-[9px] text-white/35`}>{c[field] ? "uploaded" : "generated (default)"} · {hint}</p>
      </div>
      <div className="flex gap-1">
        <label className={`${btn} cursor-pointer`}>
          Upload
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void upload(field, e)} />
        </label>
        <button type="button" className={btn} disabled={!c[field]} onClick={() => set(field, "")}>
          Use generated
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <TabHeader title="Content" hint="words on the site · About / Contact / hero tagline preview live in the dock; titles & images apply after the deploy" />

      <div className="grid gap-x-8 xl:grid-cols-2">
        <Section title="Site">
          <div className="flex flex-col gap-3">
            <Field label="Site title" counter={[c.siteTitle.length, 60]} hint="browser tab, search results, shares">
              <input value={c.siteTitle} maxLength={90} onChange={(e) => set("siteTitle", e.target.value)} className={input} />
            </Field>
            <Field label="Site description" counter={[c.siteDescription.length, 160]}>
              <textarea rows={3} value={c.siteDescription} maxLength={300} onChange={(e) => set("siteDescription", e.target.value)} className={input} />
            </Field>
            <Field label="Hero tagline" counter={[c.tagline.length, 160]} hint="the line under the name">
              <textarea rows={2} value={c.tagline} maxLength={220} onChange={(e) => set("tagline", e.target.value)} className={input} />
            </Field>
          </div>
        </Section>

        <Section title="Identity">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact email">
              <input type="email" value={c.email} onChange={(e) => set("email", e.target.value.trim())} className={input} />
            </Field>
            <Field label="Location">
              <input value={c.location} maxLength={40} onChange={(e) => set("location", e.target.value)} className={input} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Role" hint="schema.org job title, manifest, share cards">
                <input value={c.role} maxLength={80} onChange={(e) => set("role", e.target.value)} className={input} />
              </Field>
            </div>
          </div>
        </Section>
      </div>

      <Section title="About" hint="paragraphs in order · the highlight is set brighter, last">
        <div className="flex flex-col gap-2">
          {c.aboutParagraphs.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 font-mono text-[10px] tabular-nums text-white/30">{String(i + 1).padStart(2, "0")}</span>
              <textarea
                rows={3}
                value={p}
                maxLength={900}
                aria-label={`About paragraph ${i + 1}`}
                onChange={(e) => set("aboutParagraphs", c.aboutParagraphs.map((x, j) => (j === i ? e.target.value : x)))}
                className={input}
              />
              <button
                type="button"
                className={`${btn} mt-1`}
                disabled={c.aboutParagraphs.length <= 1}
                onClick={() => set("aboutParagraphs", c.aboutParagraphs.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <div>
            <button type="button" className={btn} disabled={c.aboutParagraphs.length >= 8} onClick={() => set("aboutParagraphs", [...c.aboutParagraphs, ""])}>
              + Paragraph
            </button>
          </div>
          <Field label="Highlight">
            <textarea rows={2} value={c.aboutHighlight} maxLength={600} onChange={(e) => set("aboutHighlight", e.target.value)} className={input} />
          </Field>
        </div>
      </Section>

      <div className="grid gap-x-8 xl:grid-cols-2">
        <Section title="Stats" hint="up to 6 · e.g. 11M+ / Views">
          <div className="flex flex-col gap-2">
            {c.stats.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label="Value"
                  value={s.value}
                  maxLength={12}
                  onChange={(e) => set("stats", c.stats.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  className={`${input} w-28 font-black`}
                />
                <input
                  aria-label="Label"
                  value={s.label}
                  maxLength={24}
                  onChange={(e) => set("stats", c.stats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  className={input}
                />
                <button type="button" className={btn} onClick={() => set("stats", c.stats.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <div>
              <button type="button" className={btn} disabled={c.stats.length >= 6} onClick={() => set("stats", [...c.stats, { value: "", label: "" }])}>
                + Stat
              </button>
            </div>
          </div>
        </Section>

        <Section title="Social links" hint="drag ⋮⋮ to reorder · footer, contact, menu">
          <ReorderList
            label="Social links"
            handle
            items={socials}
            getId={(s) => s.id}
            onChange={setSocials}
            className="mb-2 flex flex-col gap-1.5"
            render={(s) => (
              <div className="flex items-center gap-2">
                <span data-drag-handle className="cursor-grab select-none px-1 text-white/30" aria-hidden>
                  ⋮⋮
                </span>
                <input
                  aria-label="Label"
                  value={s.label}
                  maxLength={30}
                  onChange={(e) => setSocials(socials.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)))}
                  className={`${input} w-32`}
                />
                <input
                  aria-label="Link"
                  value={s.href}
                  placeholder="https://…"
                  onChange={(e) => setSocials(socials.map((x) => (x.id === s.id ? { ...x, href: e.target.value.trim() } : x)))}
                  className={input}
                />
                <button type="button" className={btn} onClick={() => setSocials(socials.filter((x) => x.id !== s.id))}>
                  ✕
                </button>
              </div>
            )}
          />
          <button
            type="button"
            className={btn}
            disabled={socials.length >= 12}
            onClick={() => setSocials([...socials, { id: key(), label: "", href: "https://" }])}
          >
            + Link
          </button>
        </Section>
      </div>

      <Section title="Images" hint="PNG / JPEG / WebP · uploads go to Vercel Blob">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr]">
          {imageSlot("ogImage", "Share image", "1200×630 · Open Graph + X card", "aspect-[1200/630]")}
          {imageSlot("favicon", "Favicon", "square, 64px+", "aspect-square max-h-48")}
        </div>
      </Section>
    </div>
  );
}
