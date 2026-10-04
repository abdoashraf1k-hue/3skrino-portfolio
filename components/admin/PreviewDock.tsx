"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { HeroConfig } from "@/data/hero-config";
import type { SiteConfig } from "@/data/site-config";
import { ADMIN_PREVIEW_FX_EVENT, PREVIEW_FX, PREVIEW_MESSAGE, PREVIEW_PARAM, PREVIEW_READY } from "@/lib/live-config";
import { btn, micro } from "./ui";

const PAGES = [
  { path: "/", label: "Home" },
  { path: "/vertical-cuts", label: "Vertical" },
  { path: "/horizontal-cuts", label: "Horizontal" },
  { path: "/ai-cuts", label: "AI" },
  { path: "/about", label: "About" },
  { path: "/contact", label: "Contact" },
] as const;

const DEVICES = {
  desktop: { w: 1440, h: 900, label: "Desktop" },
  tablet: { w: 820, h: 1180, label: "Tablet" },
  mobile: { w: 390, h: 844, label: "Mobile" },
} as const;
type Device = keyof typeof DEVICES;

const STORE = "3skrino-admin-preview";
type Saved = { open: boolean; w: number; h: number; device: Device; path: string };
const DEFAULTS: Saved = { open: true, w: 520, h: 360, device: "desktop", path: "/" };

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      open: typeof v.open === "boolean" ? v.open : DEFAULTS.open,
      w: typeof v.w === "number" ? v.w : DEFAULTS.w,
      h: typeof v.h === "number" ? v.h : DEFAULTS.h,
      device: v.device && v.device in DEVICES ? v.device : DEFAULTS.device,
      path: typeof v.path === "string" && PAGES.some((p) => p.path === v.path) ? v.path : DEFAULTS.path,
    };
  } catch {
    return DEFAULTS;
  }
}

type Props = {
  hero: HeroConfig | null;
  site: SiteConfig | null;
  dirty: boolean;
  /** Tabs can ask the dock to show a page (e.g. Hero → "/"). */
  focusPath?: string;
};

/**
 * The persistent live preview: a floating, resizable, collapsible frame of
 * the real site that renders every unsaved draft (hero, theme, roles,
 * brands, layout, content) as you edit. On phones it collapses to a button
 * that opens a full-screen sheet.
 */
export default function PreviewDock({ hero, site, dirty, focusPath }: Props) {
  // Defaults on the server / first render; the stored layout applies after mount.
  const [state, setState] = useState<Saved>(DEFAULTS);
  const [mounted, setMounted] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: DEFAULTS.w, h: DEFAULTS.h - 40 });

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const mq = window.matchMedia("(max-width: 767px)");
      setState({ ...load(), ...(mq.matches ? { open: false } : {}) });
      setMobile(mq.matches);
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {
      // storage blocked — layout just isn't remembered
    }
  }, [state, mounted]);

  useEffect(() => {
    if (!focusPath) return;
    const id = requestAnimationFrame(() => setState((s) => (s.path === focusPath ? s : { ...s, path: focusPath })));
    return () => cancelAnimationFrame(id);
  }, [focusPath]);

  // Measure the frame box so the page can be scaled to fit.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.open, mobile, mounted]);

  const post = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (!win || (!hero && !site)) return;
    win.postMessage({ type: PREVIEW_MESSAGE, hero, site }, window.location.origin);
  }, [hero, site]);

  useEffect(() => {
    const id = window.setTimeout(post, 90);
    return () => window.clearTimeout(id);
  }, [post]);

  useEffect(() => {
    const onMsg = (e: MessageEvent<unknown>) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data;
      if (typeof d === "object" && d !== null && "type" in d && d.type === PREVIEW_READY) post();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [post]);

  // Effects → "Fire in preview": play a page transition inside the frame.
  useEffect(() => {
    const fire = () => frameRef.current?.contentWindow?.postMessage({ type: PREVIEW_FX }, window.location.origin);
    window.addEventListener(ADMIN_PREVIEW_FX_EVENT, fire);
    return () => window.removeEventListener(ADMIN_PREVIEW_FX_EVENT, fire);
  }, []);

  // Drag the top-left corner to resize (the dock is anchored bottom-right).
  const startResize = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, w: state.w, h: state.h };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const w = Math.min(window.innerWidth - 32, Math.max(320, start.w + (start.x - ev.clientX)));
      const h = Math.min(window.innerHeight - 96, Math.max(220, start.h + (start.y - ev.clientY)));
      setState((s) => ({ ...s, w, h }));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  if (!mounted) return null;

  const device = DEVICES[state.device];
  const scale = box.w > 0 ? box.w / device.w : 0.3;
  const src = `${state.path}?${PREVIEW_PARAM}=1`;

  if (!state.open) {
    return (
      <button
        type="button"
        onClick={() => setState((s) => ({ ...s, open: true }))}
        className="admin-fade fixed bottom-4 right-4 z-[130] flex items-center gap-2 border border-[#e7fe55]/40 bg-[#111]/95 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-[#e7fe55] shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur"
      >
        <span className={`size-1.5 rounded-full ${dirty ? "animate-pulse bg-[#e7fe55]" : "bg-white/40"}`} />
        Live preview
      </button>
    );
  }

  const panel = mobile
    ? "fixed inset-0 z-[160] flex flex-col bg-[#0a0a0a]"
    : "admin-clip-reveal-up fixed bottom-4 right-4 z-[130] flex flex-col border border-white/15 bg-[#0d0d0d] shadow-[0_24px_80px_rgba(0,0,0,0.7)]";

  return (
    <aside aria-label="Live preview" className={panel} style={mobile ? undefined : { width: state.w, height: state.h }}>
      {!mobile && (
        <button
          type="button"
          aria-label="Resize preview"
          title="Drag to resize"
          onPointerDown={startResize}
          className="absolute -left-1.5 -top-1.5 z-10 size-4 cursor-nwse-resize! rounded-full border border-white/30 bg-[#0d0d0d] hover:border-[#e7fe55]"
        />
      )}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className={`${micro} flex items-center gap-1.5 text-white/60`}>
          <span className={`size-1.5 rounded-full ${dirty ? "animate-pulse bg-[#e7fe55]" : "bg-[#3dffb0]"}`} />
          {dirty ? "Draft" : "Live"}
        </span>
        <select
          aria-label="Page"
          value={state.path}
          onChange={(e) => setState((s) => ({ ...s, path: e.target.value }))}
          className="h-7 border border-white/15 bg-[#111] px-1.5 font-mono text-[10px] uppercase tracking-widest"
        >
          {PAGES.map((p) => (
            <option key={p.path} value={p.path}>
              {p.label}
            </option>
          ))}
        </select>
        <div role="radiogroup" aria-label="Device" className="flex">
          {(Object.keys(DEVICES) as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={state.device === d}
              onClick={() => setState((s) => ({ ...s, device: d }))}
              className={`-ml-px h-7 border px-2 font-mono text-[9px] uppercase tracking-widest first:ml-0 ${
                state.device === d ? "relative z-10 border-[#e7fe55] text-[#e7fe55]" : "border-white/15 text-white/45 hover:text-white"
              }`}
            >
              {DEVICES[d].label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-1">
          <button type="button" className={`${btn} h-7 px-2`} onClick={() => setFrameKey((k) => k + 1)} title="Reload">
            ↻
          </button>
          <a className={`${btn} h-7 px-2`} href={state.path} target="_blank" rel="noreferrer" title="Open the live site">
            ↗
          </a>
          <button
            type="button"
            className={`${btn} h-7 px-2`}
            onClick={() => setState((s) => ({ ...s, open: false }))}
            aria-label="Collapse preview"
            title="Collapse"
          >
            {mobile ? "✕" : "—"}
          </button>
        </span>
      </header>
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <iframe
          key={frameKey}
          ref={frameRef}
          src={src}
          title="Live site preview"
          onLoad={post}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{ width: device.w, height: Math.max(1, box.h / scale), transform: `scale(${scale})` }}
        />
      </div>
    </aside>
  );
}
