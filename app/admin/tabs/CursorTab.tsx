"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { card, Choice, ColorField, micro, Section, Segmented, Slider, TabHeader, Toggle } from "@/components/admin/ui";
import CursorShape, { CURSOR_SCALE } from "@/components/ui/CursorShape";
import { CURSOR_STYLES, DEFAULT_CINEMATIC } from "@/data/cinematic-defaults";
import type { CinematicConfig, CursorStyle } from "@/data/site-config";
import { colorCss } from "@/lib/cinematic";
import { useConfigStore } from "../store";

type Cursor = CinematicConfig["cursor"];

const STYLE_NOTES: Record<CursorStyle, string> = {
  dot: "The original: a dot, and a ring that blooms over links",
  ring: "A ring that's always there",
  crosshair: "Four hairlines — turns 45° over links",
  playhead: "An editor's playhead",
  aperture: "Six iris blades that open over links",
};

/** A colour token picker: accent / white / custom hex. */
function TokenColor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const mode = value === "accent" || value === "white" ? value : "custom";
  return (
    <div className={`${card} flex flex-col gap-2 px-3 py-2.5`}>
      <p className="text-sm">{label}</p>
      <Segmented
        label={label}
        value={mode}
        onChange={(m) => onChange(m === "custom" ? (mode === "custom" ? value : "#ffffff") : m)}
        options={[
          { value: "accent", label: "Accent" },
          { value: "white", label: "White" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {mode === "custom" && <ColorField label="Hex" value={value} onChange={onChange} />}
    </div>
  );
}

export default function CursorTab() {
  const { site, setSite } = useConfigStore();
  if (!site) return null;
  const cur = site.cinematic.cursor;
  const set = (patch: Partial<Cursor>) => setSite((s) => ({ ...s, cinematic: { ...s.cinematic, cursor: { ...s.cinematic.cursor, ...patch } } }));
  const reset = () => set(DEFAULT_CINEMATIC.cursor);

  return (
    <div>
      <TabHeader title="Cursor Studio" hint="the custom cursor on desktop (touch screens keep their own) · try it in the test area" />

      <div className="grid gap-8 2xl:grid-cols-[minmax(0,1fr)_480px]">
        <div>
          <Section title="Style" onReset={reset} help="The shape that trails the pointer. The small dot always tracks exactly; this layer lags a little behind it.">
            <Choice<CursorStyle>
              label="Cursor style"
              value={cur.style}
              onChange={(style) => set({ style })}
              options={CURSOR_STYLES.map((s) => ({
                value: s,
                label: s,
                note: STYLE_NOTES[s],
                preview: (
                  <span className="flex h-20 items-center justify-center bg-black/40">
                    <span className="group" data-mode="hover">
                      <CursorShape cursor={{ ...cur, style: s }} />
                    </span>
                  </span>
                ),
              }))}
            />
          </Section>

          <Section title="Size & colour">
            <div className="grid gap-2 md:grid-cols-2">
              <div className={`${card} px-3 py-2.5`}>
                <p className="mb-2 text-sm">Size</p>
                <Segmented
                  label="Size"
                  value={cur.size}
                  onChange={(size) => set({ size })}
                  options={[
                    { value: "sm", label: "Small" },
                    { value: "md", label: "Medium" },
                    { value: "lg", label: "Large" },
                  ]}
                />
              </div>
              <TokenColor label="Colour" value={cur.color} onChange={(color) => set({ color })} />
            </div>
          </Section>

          <Section title="Trail" help="A tail of fading dots that chases the pointer — each dot follows the one before it.">
            <div className="grid gap-2 md:grid-cols-2">
              <Toggle label="Trail" checked={cur.trail.enabled} onChange={(enabled) => set({ trail: { ...cur.trail, enabled } })} />
              <Slider
                label="Length"
                value={cur.trail.length}
                min={2}
                max={24}
                step={1}
                format={(v) => `${v} dots`}
                disabled={!cur.trail.enabled}
                onChange={(length) => set({ trail: { ...cur.trail, length } })}
              />
            </div>
          </Section>

          <Section title="Over links & buttons" help="What the cursor does over anything clickable. Scale 1× keeps the style's own hover animation.">
            <div className="grid gap-2 md:grid-cols-3">
              <Slider label="Scale" value={cur.hover.scale} min={1} max={3} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(scale) => set({ hover: { ...cur.hover, scale } })} />
              <TokenColor label="Colour" value={cur.hover.color} onChange={(color) => set({ hover: { ...cur.hover, color } })} />
              <Toggle label="Glow" checked={cur.hover.glow} onChange={(glow) => set({ hover: { ...cur.hover, glow } })} />
            </div>
          </Section>
        </div>

        <Section title="Test area" hint="move over the box — the buttons and the card count as links">
          <TestArea cursor={cur} />
        </Section>
      </div>
    </div>
  );
}

/** A box with its own simulated site cursor (the admin keeps the native one everywhere else). */
function TestArea({ cursor }: { cursor: Cursor }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const [inside, setInside] = useState(false);
  const [hover, setHover] = useState(false);
  const trailLength = cursor.trail.enabled ? cursor.trail.length : 0;

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const mouse = { x: -100, y: -100 };
    const ring = { x: -100, y: -100 };
    const trail = Array.from({ length: trailLength }, () => ({ x: -100, y: -100 }));
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const loop = () => {
      ring.x += (mouse.x - ring.x) * 0.2;
      ring.y += (mouse.y - ring.y) * 0.2;
      if (ringRef.current) ringRef.current.style.transform = `translate(${ring.x}px, ${ring.y}px) translate(-50%, -50%)`;
      if (dotRef.current) dotRef.current.style.transform = `translate(${mouse.x}px, ${mouse.y}px) translate(-50%, -50%)`;
      let lead = mouse;
      const dots = trailRef.current?.children;
      trail.forEach((p, i) => {
        p.x += (lead.x - p.x) * 0.38;
        p.y += (lead.y - p.y) * 0.38;
        const el = dots?.[i] as HTMLElement | undefined;
        if (el) el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
        lead = p;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    box.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener("pointermove", onMove);
    };
  }, [trailLength]);

  const k = CURSOR_SCALE[cursor.size];
  const dot = Math.max(3, Math.round(4 * k));
  const hot = { onPointerEnter: () => setHover(true), onPointerLeave: () => setHover(false) };

  return (
    <div
      ref={boxRef}
      onPointerEnter={() => setInside(true)}
      onPointerLeave={() => setInside(false)}
      data-cursor-test
      className="relative h-[420px] overflow-hidden border border-white/10 bg-[#0a0a0a]"
    >
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-6">
          <p className="text-3xl font-black uppercase tracking-tight text-white/90">3skrino</p>
          <div className="flex gap-3">
            <button type="button" {...hot} className="border border-white px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest">
              View work
            </button>
            <button type="button" {...hot} className="font-mono text-[10px] uppercase tracking-widest text-white/60">
              Showreel ▶
            </button>
          </div>
          <div {...hot} className="aspect-[9/16] w-24 bg-[linear-gradient(160deg,#e7fe5555,#141414_70%)]" />
        </div>
      </div>
      <p className={`${micro} absolute bottom-2 left-3 text-white/30`}>{inside ? (hover ? "over a link" : "free") : "move in here"}</p>
      <div style={{ opacity: inside ? 1 : 0 }} className="transition-opacity">
        <div ref={trailRef} aria-hidden>
          {Array.from({ length: trailLength }, (_, i) => {
            const t = 1 - i / trailLength;
            return (
              <div
                key={i}
                className="pointer-events-none absolute left-0 top-0 rounded-full"
                style={{ width: dot * (0.4 + t * 0.9), height: dot * (0.4 + t * 0.9), background: colorCss(cursor.color), opacity: t * 0.6 } as CSSProperties}
              />
            );
          })}
        </div>
        <div ref={ringRef} className="group pointer-events-none absolute left-0 top-0" data-mode={hover ? "hover" : "default"}>
          <CursorShape cursor={cursor} />
        </div>
        <div
          ref={dotRef}
          className="pointer-events-none absolute left-0 top-0 rounded-full"
          style={{ width: dot, height: dot, background: cursor.style === "dot" ? "#f5f5f5" : colorCss(cursor.color) }}
        />
      </div>
    </div>
  );
}
