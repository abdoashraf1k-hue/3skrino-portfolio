"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { slugify, uniqueId } from "@/components/admin/fields";
import { btn, card, ColorField, Empty, input, micro, Section } from "@/components/admin/ui";
import type { HeroPose } from "@/data/hero-config";
import { DEFAULT_EXPRESSIONS } from "@/data/hero-defaults";
import { assertPoseFile, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { useConfigStore } from "../store";

const checker =
  "bg-[length:12px_12px] bg-[linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%),linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%)] bg-[position:0_0,6px_6px] bg-[#111]";

/** Words in a filename that become tags on bulk upload ("smile-02.png" → smile). */
const KNOWN_TAGS = ["smile", "laugh", "surprise", "anger", "angry", "side-eye", "talking", "talk", "emphasis", "pensive", "frontal", "wink", "sad", "scoff"];

const guessTags = (name: string) => {
  const n = name.toLowerCase();
  return [...new Set(KNOWN_TAGS.filter((t) => n.includes(t)).map((t) => (t === "angry" ? "anger" : t === "talk" ? "talking" : t)))];
};

const label = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 40) || "Pose";

/**
 * Poses → Expressions: the extra faces the Confrontation and Interview heroes
 * use. Bulk upload, tag, preview large. The shipped set was derived from the
 * ladder by scripts/generate-poses.mjs (warps of your own photos).
 */
export default function ExpressionsSection({ adminKey, onError }: { adminKey: string; onError: (m: string) => void }) {
  const { hero, setHero } = useConfigStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [big, setBig] = useState<HeroPose | null>(null);

  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBig(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);

  if (!hero) return null;
  const list = hero.expressions;
  const taken = () => new Set([...hero.poses.ladder, hero.poses.up, hero.poses.down, ...list].map((p) => p.id));
  const setList = (fn: (l: HeroPose[]) => HeroPose[]) => setHero((c) => ({ ...c, expressions: fn(c.expressions) }));
  const patch = (id: string, v: Partial<HeroPose>) => setList((l) => l.map((p) => (p.id === id ? { ...p, ...v } : p)));
  const allTags = [...new Set(list.flatMap((p) => p.tags ?? []))].sort();
  const shown = tag ? list.filter((p) => p.tags?.includes(tag)) : list;

  const bulk = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const ids = taken();
    for (const [i, file] of files.entries()) {
      try {
        assertPoseFile(file);
        setBusy(`Uploading ${i + 1}/${files.length} — ${file.name}`);
        const id = uniqueId(slugify(file.name.replace(/\.[a-z0-9]+$/i, ""), "pose"), ids);
        ids.add(id);
        const src = await uploadHeroAsset(file, "hero", id, adminKey);
        const tags = guessTags(file.name);
        setList((l) => [...l, { id, label: label(file.name), src, tint: "#ffffff", ...(tags.length ? { tags } : {}) }]);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setBusy(null);
  };

  const replace = async (pose: HeroPose, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      assertPoseFile(file);
      setBusy(`Uploading ${file.name}`);
      patch(pose.id, { src: await uploadHeroAsset(file, "hero", pose.id, adminKey) });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  // Where a pose is mapped (so removing it is an informed choice).
  const usedBy = (id: string) => {
    const c = hero.confrontation.poses;
    const iv = hero.interview.poses;
    return [
      ...Object.entries(c).filter(([, v]) => v === id).map(([k]) => `Confrontation ${k}`),
      ...Object.entries(iv).filter(([, v]) => v === id).map(([k]) => `Interview ${k}`),
    ];
  };

  return (
    <Section
      title={`Expressions (${list.length})`}
      hint="extra faces for Confrontation + Interview · tag #frontal when the lenses sit where the centre pose's do (enables the glint)"
      onReset={() => setList(() => DEFAULT_EXPRESSIONS)}
      aside={
        <label className={`${btn} cursor-pointer border-[#e7fe55]/40 text-[#e7fe55]`}>
          + Bulk upload
          <input type="file" multiple accept="image/png,image/webp" className="sr-only" onChange={(e) => void bulk(e)} />
        </label>
      }
    >
      {busy && <p className={`${micro} mb-2 text-[#e7fe55]`}>{busy}</p>}
      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Filter by tag">
          <button type="button" className={`${btn} ${tag === null ? "border-[#e7fe55] text-[#e7fe55]" : ""}`} onClick={() => setTag(null)}>
            All
          </button>
          {allTags.map((t) => (
            <button key={t} type="button" className={`${btn} ${tag === t ? "border-[#e7fe55] text-[#e7fe55]" : ""}`} onClick={() => setTag(tag === t ? null : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {!shown.length ? (
        <Empty>No expression poses{tag ? ` tagged #${tag}` : ""} — bulk upload transparent PNG / WebP, same framing as the ladder</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((p) => {
            const uses = usedBy(p.id);
            return (
              <li key={p.id} className={`${card} flex flex-col gap-2 p-2`}>
                <button type="button" onClick={() => setBig(p)} className={`relative aspect-square w-full overflow-hidden ${checker}`} aria-label={`Preview ${p.label} large`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                  <img src={p.src} alt="" className="absolute inset-0 size-full object-contain" />
                </button>
                <input aria-label="Label" className={input} value={p.label} maxLength={40} onChange={(e) => patch(p.id, { label: e.target.value })} />
                <input
                  aria-label="Tags"
                  className={`${input} font-mono text-[11px]`}
                  placeholder="tags, comma, separated"
                  defaultValue={(p.tags ?? []).join(", ")}
                  key={(p.tags ?? []).join(",")}
                  onBlur={(e) => {
                    const tags = [...new Set(e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
                    patch(p.id, { tags: tags.length ? tags : undefined });
                  }}
                />
                <ColorField label="Rim tint" value={p.tint} onChange={(tint) => patch(p.id, { tint })} />
                <p className={`${micro} text-[9px] text-white/35`}>{uses.length ? `used by ${uses.join(" · ")}` : `id ${p.id} · not mapped`}</p>
                <div className="flex gap-1">
                  <label className={`${btn} flex-1 cursor-pointer`}>
                    Replace
                    <input type="file" accept="image/png,image/webp" className="sr-only" onChange={(e) => void replace(p, e)} />
                  </label>
                  <button
                    type="button"
                    className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff6b6b]`}
                    title={uses.length ? "Mapped poses fall back to the centre pose when removed" : undefined}
                    onClick={() => setList((l) => l.filter((x) => x.id !== p.id))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {big && (
        <div role="dialog" aria-modal="true" aria-label={big.label} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-6" onClick={() => setBig(null)}>
          <figure className="flex max-h-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <div className={`relative aspect-square h-[min(80vh,90vw)] ${checker}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin full-size preview */}
              <img src={big.src} alt={big.label} className="absolute inset-0 size-full object-contain" />
            </div>
            <figcaption className={`${micro} text-white/60`}>
              {big.label} · {(big.tags ?? []).map((t) => `#${t}`).join(" ")} · Esc to close
            </figcaption>
            <button type="button" className={btn} onClick={() => setBig(null)}>
              Close
            </button>
          </figure>
        </div>
      )}
    </Section>
  );
}
