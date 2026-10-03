"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import ReorderList from "@/components/admin/ReorderList";
import { btn, card, Empty, input, micro, Section, TabHeader, Toggle } from "@/components/admin/ui";
import HeroLogos from "@/components/sections/HeroLogos";
import type { BrandLogo } from "@/data/hero-config";
import { assertLogoFile, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { useConfigStore } from "../store";

const checker =
  "bg-[length:12px_12px] bg-[linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%),linear-gradient(45deg,#1a1a1a_25%,transparent_25%,transparent_75%,#1a1a1a_75%)] bg-[position:0_0,6px_6px] bg-[#111]";

const titleFromFile = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 60) || "Brand";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "brand";

function uniqueId(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

type Props = { adminKey: string; onError: (m: string) => void };

/** The site's hero at desktop size (1440×900), scaled down to fit — logos sit exactly where they will live. */
const STAGE = { w: 1440, h: 900 };

function MiniHero({ children, still }: { children: ReactNode; still: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / STAGE.w));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative w-full overflow-hidden border border-white/10 bg-[#0a0a0a]" style={{ height: STAGE.h * scale }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: STAGE.w, height: STAGE.h, transform: `scale(${scale})` }}>
        <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(50% 40% at 50% 50%, rgb(255 45 45 / 0.16), transparent 70%)" }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- static stand-in for the 3D head */}
        <img
          src={still}
          alt=""
          className="absolute bottom-0 left-1/2 aspect-square h-[92%] -translate-x-1/2 object-contain object-bottom"
          style={{ filter: "brightness(0.82) drop-shadow(0 -1px 0 rgb(231 254 85 / 0.9)) drop-shadow(0 0 10px rgb(231 254 85 / 0.35))" }}
        />
        {children}
      </div>
    </div>
  );
}

export default function BrandsTab({ adminKey, onError }: Props) {
  const { hero, setHero } = useConfigStore();
  const [busy, setBusy] = useState<Record<string, string>>({});
  if (!hero) return null;

  const items = hero.logos.items;
  const setItems = (fn: (items: BrandLogo[]) => BrandLogo[]) => setHero((c) => ({ ...c, logos: { ...c.logos, items: fn(c.logos.items) } }));
  const setLogo = (id: string, patch: Partial<BrandLogo>) => setItems((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const track = (id: string, label: string | null) =>
    setBusy((b) => {
      const next = { ...b };
      if (label === null) delete next[id];
      else next[id] = label;
      return next;
    });

  const add = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    for (const file of files) {
      const tmp = `upload-${file.name}`;
      try {
        assertLogoFile(file);
        track(tmp, "0%");
        const name = titleFromFile(file.name);
        const url = await uploadHeroAsset(file, "brands", name, adminKey, (p) => track(tmp, `${p}%`));
        setItems((list) => [...list, { id: uniqueId(slugify(name), new Set(list.map((l) => l.id))), name, imageUrl: url, size: 56, visible: true }]);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        track(tmp, null);
      }
    }
  };

  const replaceImage = async (logo: BrandLogo, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      assertLogoFile(file);
      track(logo.id, "0%");
      const url = await uploadHeroAsset(file, "brands", logo.name, adminKey, (p) => track(logo.id, `${p}%`));
      setLogo(logo.id, { imageUrl: url });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      track(logo.id, null);
    }
  };

  const uploading = Object.entries(busy).filter(([k]) => k.startsWith("upload-"));
  const shown = hero.logos.enabled ? items.filter((l) => l.visible) : [];

  return (
    <div>
      <TabHeader
        title="Brands"
        hint="client logos floating around the hero silhouette · clicks pulse, never navigate"
        actions={
          <label className={`${btn} cursor-pointer border-[#e7fe55]/40 text-[#e7fe55]`}>
            + Upload logos
            <input type="file" multiple accept="image/png,image/svg+xml,image/webp,image/jpeg" className="sr-only" onChange={(e) => void add(e)} />
          </label>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="min-w-0">
          <div className="mb-4 max-w-sm">
            <Toggle
              label="Floating logos"
              hint="master switch"
              checked={hero.logos.enabled}
              onChange={(v) => setHero((c) => ({ ...c, logos: { ...c.logos, enabled: v } }))}
            />
          </div>
          {uploading.map(([k, label]) => (
            <p key={k} className={`${micro} mb-2 text-[#e7fe55]`}>
              Uploading {k.slice(7)} — {label}
            </p>
          ))}
          {items.length === 0 ? (
            <Empty>No logos yet — upload PNG or SVG files</Empty>
          ) : (
            <ReorderList
              label="Brand logos"
              handle
              items={items}
              getId={(l) => l.id}
              onChange={(next) => setItems(() => next)}
              className="flex flex-col gap-1.5"
              render={(logo, i, move) => (
                <div className={`${card} flex flex-wrap items-center gap-3 p-2 ${logo.visible ? "" : "opacity-50"}`}>
                  <span data-drag-handle className="cursor-grab select-none px-1 text-white/30 active:cursor-grabbing" aria-hidden>
                    ⋮⋮
                  </span>
                  <span className="w-5 font-mono text-[10px] tabular-nums text-white/30">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`relative size-12 shrink-0 ${checker}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                    <img src={logo.imageUrl} alt="" className="absolute inset-1 size-10 object-contain" />
                    {busy[logo.id] && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/70 font-mono text-[9px] text-[#e7fe55]">{busy[logo.id]}</span>
                    )}
                  </span>
                  <input
                    aria-label="Name"
                    value={logo.name}
                    maxLength={60}
                    onChange={(e) => setLogo(logo.id, { name: e.target.value })}
                    className={`${input} min-w-32 flex-1`}
                  />
                  <input
                    aria-label="Link (reference only)"
                    placeholder="https://… (not clickable)"
                    value={logo.href ?? ""}
                    onChange={(e) => setLogo(logo.id, { href: e.target.value || undefined })}
                    className={`${input} min-w-40 flex-1`}
                  />
                  <label className={`${micro} flex items-center gap-2 text-white/50`}>
                    Size
                    <input
                      type="range"
                      min={40}
                      max={80}
                      step={2}
                      value={logo.size ?? 56}
                      onChange={(e) => setLogo(logo.id, { size: Number(e.target.value) })}
                      className="w-20 accent-[#e7fe55]"
                    />
                    <span className="w-6 tabular-nums text-white/70">{logo.size ?? 56}</span>
                  </label>
                  <span className="flex gap-1">
                    <button type="button" className={btn} aria-pressed={logo.visible} onClick={() => setLogo(logo.id, { visible: !logo.visible })}>
                      {logo.visible ? "On" : "Off"}
                    </button>
                    <label className={`${btn} cursor-pointer`}>
                      Image
                      <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="sr-only" onChange={(e) => void replaceImage(logo, e)} />
                    </label>
                    <button type="button" className={btn} aria-label={`Move ${logo.name} up`} disabled={i === 0} onClick={() => move(-1)}>
                      ↑
                    </button>
                    <button type="button" className={btn} aria-label={`Move ${logo.name} down`} disabled={i === items.length - 1} onClick={() => move(1)}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff6b6b]`}
                      onClick={() => setItems((list) => list.filter((l) => l.id !== logo.id))}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              )}
            />
          )}
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <Section title="Mini hero" hint="the ring as it floats on the site — move your mouse">
            <MiniHero still={hero.poses.ladder[3]?.src ?? "/hero/silhouette-900.webp"}>
              <HeroLogos logos={shown} reducedMotion={false} />
            </MiniHero>
            {!shown.length && (
              <p className={`${micro} mt-2 text-white/40`}>{hero.logos.enabled ? "No visible logos" : "Floating logos are switched off"}</p>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
