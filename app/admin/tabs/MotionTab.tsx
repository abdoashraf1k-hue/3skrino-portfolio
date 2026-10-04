"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { btn, btnPrimary, card, Choice, input, micro, Section, Slider, TabHeader } from "@/components/admin/ui";
import { DEFAULT_CINEMATIC, ENTRY_ANIMATIONS } from "@/data/cinematic-defaults";
import { SECTION_LABELS, type EntryAnimation, type SectionId } from "@/data/site-config";
import { bezierCss, parseEasing, type Bezier } from "@/lib/easing";
import { useConfigStore } from "../store";

const EASE_PRESETS: { label: string; value: string }[] = [
  { label: "Site default", value: "cubic-bezier(0.22, 1, 0.36, 1)" },
  { label: "Expo out", value: "cubic-bezier(0.16, 1, 0.3, 1)" },
  { label: "Cut (in-out)", value: "cubic-bezier(0.76, 0, 0.24, 1)" },
  { label: "Back out", value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  { label: "Linear", value: "linear" },
  { label: "Ease", value: "ease" },
];

const ENTRY_NOTES: Record<EntryAnimation, string> = {
  fade: "opacity only",
  slide: "rise 40px (the original)",
  scale: "grow from 92%",
  blur: "sharpen from a 12px blur",
};

/** WAAPI keyframes for an entry style — the same moves Reveal makes with GSAP on the site. */
export function entryFrames(entry: EntryAnimation): Keyframe[] {
  const from: Keyframe =
    entry === "fade"
      ? { opacity: 0 }
      : entry === "slide"
        ? { opacity: 0, transform: "translateY(40px)" }
        : entry === "scale"
          ? { opacity: 0, transform: "scale(0.92)" }
          : { opacity: 0, transform: "translateY(10px)", filter: "blur(12px)" };
  return [from, { opacity: 1, transform: "none", filter: "blur(0px)" }];
}

const SECTION_IDS = Object.keys(SECTION_LABELS) as SectionId[];

export default function MotionTab() {
  const { site, setSite } = useConfigStore();
  if (!site) return null;
  const motion = site.cinematic.motion;
  const sections = site.cinematic.sections;
  const set = (patch: Partial<typeof motion>) => setSite((s) => ({ ...s, cinematic: { ...s.cinematic, motion: { ...s.cinematic.motion, ...patch } } }));
  const setSectionEntry = (id: SectionId, entry: EntryAnimation | "") =>
    setSite((s) => {
      const cur = { ...(s.cinematic.sections[id] ?? {}) };
      if (entry) cur.entry = entry;
      else delete cur.entry;
      const next = { ...s.cinematic.sections };
      if (Object.keys(cur).length) next[id] = cur;
      else delete next[id];
      return { ...s, cinematic: { ...s.cinematic, sections: next } };
    });

  return (
    <div>
      <TabHeader title="Motion Lab" hint="speed, entrances, hovers and easing for the whole site · reduced-motion visitors always get still pages" />

      <div className="grid gap-8 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div>
          <Section
            title="Global speed"
            onReset={() => set({ speed: DEFAULT_CINEMATIC.motion.speed })}
            help="Scales every GSAP animation on the site (reveals, the hero's name line, scroll scenes) and the hover durations below. 0.5× is half speed (slower), 2× twice as fast."
          >
            <Slider label="Speed multiplier" value={motion.speed} min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(speed) => set({ speed })} />
          </Section>

          <Section title="Section entrances" onReset={() => set({ entry: DEFAULT_CINEMATIC.motion.entry })} help="How content arrives as it scrolls into view. Sections can override it below or in admin → Sections.">
            <Choice<EntryAnimation>
              label="Entry animation"
              value={motion.entry}
              onChange={(entry) => set({ entry })}
              columns="sm:grid-cols-4 xl:grid-cols-4"
              options={ENTRY_ANIMATIONS.map((e) => ({ value: e, label: e, note: ENTRY_NOTES[e], preview: <EntryChip entry={e} easing={motion.easing} /> }))}
            />
          </Section>

          <Section title="Hover" onReset={() => set({ hover: DEFAULT_CINEMATIC.motion.hover })} help="How long links, buttons and cards take to change on hover. 300ms is the site's original timing — any other value takes over every hover on the site.">
            <Slider label="Hover duration" value={motion.hover} min={80} max={1200} step={10} format={(v) => `${v}ms`} onChange={(hover) => set({ hover })} />
          </Section>

          <Section title="Easing" onReset={() => set({ easing: DEFAULT_CINEMATIC.motion.easing })} help="The acceleration curve for entrances and hovers. Drag the two handles; the x axis is time, the y axis is progress (above 1 overshoots).">
            <EasingEditor value={motion.easing} onChange={(easing) => set({ easing })} />
          </Section>

          <Section title="Per-section entrances" hint="blank = follow the global entrance">
            <ul className="grid gap-2 md:grid-cols-2">
              {SECTION_IDS.map((id) => (
                <li key={id} className={`${card} flex items-center justify-between gap-3 px-3 py-2`}>
                  <span className="text-sm">{SECTION_LABELS[id]}</span>
                  <select
                    value={sections[id]?.entry ?? ""}
                    onChange={(e) => setSectionEntry(id, e.target.value as EntryAnimation | "")}
                    className={`${input} w-36`}
                    aria-label={`${SECTION_LABELS[id]} entrance`}
                  >
                    <option value="">Global ({motion.entry})</option>
                    {ENTRY_ANIMATIONS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section title="Test area" hint="replays with your settings">
          <TestStage entry={motion.entry} easing={motion.easing} speed={motion.speed} hover={motion.hover} />
        </Section>
      </div>
    </div>
  );
}

function EntryChip({ entry, easing }: { entry: EntryAnimation; easing: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const play = () => ref.current?.animate(entryFrames(entry), { duration: 700, easing, fill: "both" });
  return (
    <span onMouseEnter={play} className="flex h-16 items-center justify-center bg-black/40">
      <span ref={ref} className="h-8 w-14 bg-[linear-gradient(135deg,#e7fe55,#3dd9ff)]" />
    </span>
  );
}

function TestStage({ entry, easing, speed, hover }: { entry: EntryAnimation; easing: string; speed: number; hover: number }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    refs.current.forEach((el, i) => el?.animate(entryFrames(entry), { duration: 700 / speed, delay: (i * 80) / speed, easing, fill: "both" }));
  }, [entry, easing, speed, run]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 border border-white/10 bg-[#0a0a0a] p-4">
        {["Vertical cuts", "Horizontal cuts", "AI cuts", "About"].map((t, i) => (
          <div
            key={t}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="flex aspect-[4/3] items-end bg-[linear-gradient(160deg,#262626,#111)] p-2 text-xs font-black uppercase"
          >
            {t}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} onClick={() => setRun((r) => r + 1)}>
          ↻ Replay entrance
        </button>
        <button
          type="button"
          className="border border-white px-5 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-white hover:text-black"
          style={{ transitionProperty: "background-color, color", transitionDuration: `${Math.round(hover / speed)}ms`, transitionTimingFunction: easing }}
        >
          Hover me
        </button>
        <span className={`${micro} text-white/35`}>
          {Math.round(700 / speed)}ms entrance · {Math.round(hover / speed)}ms hover
        </span>
      </div>
    </div>
  );
}

/** A cubic-bezier editor: two draggable handles, presets and the CSS value. */
function EasingEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const pts: Bezier = parseEasing(value) ?? [0.22, 1, 0.36, 1];
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    // Keep the text box in sync when the value changes elsewhere (presets, handles, reset).
    setLastValue(value);
    setText(value);
  }
  const svgRef = useRef<SVGSVGElement>(null);
  const S = 220;
  const PAD = 30;
  const Y0 = -0.5;
  const Y1 = 1.5;
  const toX = (x: number) => PAD + x * (S - PAD * 2);
  const toY = (y: number) => PAD + (1 - (y - Y0) / (Y1 - Y0)) * (S - PAD * 2);

  const drag = (handle: 0 | 1) => (e: ReactPointerEvent<SVGCircleElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * S;
      const py = ((ev.clientY - r.top) / r.height) * S;
      const x = Math.min(1, Math.max(0, (px - PAD) / (S - PAD * 2)));
      const y = Math.min(2, Math.max(-1, Y0 + (1 - (py - PAD) / (S - PAD * 2)) * (Y1 - Y0)));
      const next: Bezier = [...pts];
      next[handle * 2] = x;
      next[handle * 2 + 1] = y;
      onChange(bezierCss(next));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const [x1, y1, x2, y2] = pts;
  const curve = `M${toX(0)},${toY(0)} C${toX(x1)},${toY(y1)} ${toX(x2)},${toY(y2)} ${toX(1)},${toY(1)}`;
  const valid = parseEasing(text) !== null;

  return (
    <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <svg ref={svgRef} viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[240px] touch-none border border-white/10 bg-black/40" role="img" aria-label={`Easing curve ${value}`}>
        <rect x={toX(0)} y={toY(1)} width={toX(1) - toX(0)} height={toY(0) - toY(1)} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeDasharray="3 3" />
        <line x1={toX(0)} y1={toY(0)} x2={toX(x1)} y2={toY(y1)} stroke="rgb(255 255 255 / 0.35)" />
        <line x1={toX(1)} y1={toY(1)} x2={toX(x2)} y2={toY(y2)} stroke="rgb(255 255 255 / 0.35)" />
        <path d={curve} fill="none" stroke="#e7fe55" strokeWidth="2.5" />
        <circle cx={toX(x1)} cy={toY(y1)} r="7" fill="#0a0a0a" stroke="#e7fe55" strokeWidth="2" className="cursor-grab" onPointerDown={drag(0)} />
        <circle cx={toX(x2)} cy={toY(y2)} r="7" fill="#0a0a0a" stroke="#e7fe55" strokeWidth="2" className="cursor-grab" onPointerDown={drag(1)} />
        <text x={toX(0)} y={S - 8} fill="rgb(255 255 255 / 0.3)" fontSize="9" fontFamily="monospace">
          time →
        </text>
      </svg>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {EASE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.value)}
              className={`${btn} ${value === p.value ? "border-[#e7fe55] text-[#e7fe55]" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className={`${micro} mb-1 block text-white/50`}>CSS value</span>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const p = parseEasing(e.target.value);
              if (p) onChange(e.target.value.trim().toLowerCase() in { linear: 1, ease: 1, "ease-in": 1, "ease-out": 1, "ease-in-out": 1 } ? e.target.value.trim().toLowerCase() : bezierCss(p));
            }}
            spellCheck={false}
            className={`${input} font-mono text-xs ${valid ? "" : "border-[#ff2d2d]/60"}`}
          />
        </label>
        <EasePreview easing={value} />
      </div>
    </div>
  );
}

function EasePreview({ easing }: { easing: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = ref.current?.animate([{ left: "0%" }, { left: "calc(100% - 12px)" }], { duration: 1200, easing, iterations: Infinity, direction: "alternate" });
    return () => a?.cancel();
  }, [easing]);
  return (
    <span className="relative block h-3 border-b border-white/15">
      <span ref={ref} className="absolute top-0 size-3 bg-[#e7fe55]" />
    </span>
  );
}
