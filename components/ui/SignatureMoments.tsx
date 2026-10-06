"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { navLinks } from "@/data/site";
import { useNumbers } from "@/lib/brand";
import { useMediaQuery } from "@/lib/hooks";
import { useBrandConfig, isPreviewFrame } from "@/lib/live-config";

/**
 * The interactions that make the site recognisably 3SKRINO — each one a
 * switch in admin → Brand → Signature moments, each one silent under
 * prefers-reduced-motion:
 *
 *   slate wipe       — a clapperboard slate (scene · take) crosses on navigation
 *   magnetic CTAs    — [data-magnetic] elements lean toward the cursor
 *   scroll timecode  — SMPTE timecode in the corner, driven by scroll
 *   leader countdown — first visit: a 3-2-1 film leader (once per session)
 *   rack focus       — keyboard focus pulls from blur to a sharp ring (CSS)
 */

const two = (n: number) => String(n).padStart(2, "0");

function sceneOf(path: string): { n: number; name: string } {
  if (path === "/") return { n: 1, name: "Home" };
  const i = navLinks.findIndex((l) => path === l.href || path.startsWith(`${l.href}/`));
  if (i >= 0) return { n: i + 2, name: navLinks[i].label };
  return { n: navLinks.length + 2, name: path.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ?? "Scene" };
}

function SlateWipe() {
  const path = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const take = useRef(1);
  const [label, setLabel] = useState({ scene: "01", name: "Home", take: "01" });

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    take.current += 1;
    const s = sceneOf(path);
    const id = requestAnimationFrame(() => {
      setLabel({ scene: two(s.n), name: s.name, take: two(take.current) });
      const dur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dur-slow")) || 700;
      el.animate(
        [
          { transform: "translateX(-105%)", offset: 0 },
          { transform: "translateX(0)", offset: 0.38 },
          { transform: "translateX(0)", offset: 0.62 },
          { transform: "translateX(105%)", offset: 1 },
        ],
        { duration: dur * 1.3, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
      );
    });
    return () => cancelAnimationFrame(id);
  }, [path]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-1/2 z-[95] -translate-y-1/2 overflow-hidden">
      <div ref={ref} className="slate-band translate-x-[-105%]">
        <div className="slate-stripes" />
        <div className="flex items-end justify-between gap-6 bg-[#0b0b0b] px-6 py-4 font-mono uppercase tracking-widest text-white md:px-12">
          <span className="text-[10px] text-white/50">
            Scene <span className="type-display ml-2 text-4xl text-white md:text-6xl">{label.scene}</span>
          </span>
          <span className="type-display truncate text-3xl text-accent md:text-5xl">{label.name}</span>
          <span className="text-[10px] text-white/50">
            Take <span className="type-display ml-2 text-4xl text-white md:text-6xl">{label.take}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ScrollTimecode({ fps }: { fps: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const draw = () => {
      raf = 0;
      // One frame per 8px of scroll: a full page reads like a short scene.
      const frames = Math.floor(window.scrollY / 8);
      const ff = frames % fps;
      const s = Math.floor(frames / fps);
      el.textContent = `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}:${two(ff)}`;
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, [fps]);
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed bottom-4 left-4 z-[60] hidden font-mono text-[10px] tabular-nums tracking-widest text-muted mix-blend-difference md:block"
    >
      00:00:00:00
    </span>
  );
}

const LEADER_KEY = "3skrino-leader";

function LeaderCountdown() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem(LEADER_KEY) === "1";
      sessionStorage.setItem(LEADER_KEY, "1");
    } catch {
      // storage blocked — skip the leader rather than repeat it on every page
    }
    if (seen || isPreviewFrame()) return;
    const timers = [3, 2, 1].map((v, i) => window.setTimeout(() => setN(v), i * 420));
    timers.push(window.setTimeout(() => setN(null), 3 * 420 + 200));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  if (n === null) return null;
  return (
    <div aria-hidden className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0b0b0b]">
      <div className="leader-ring relative flex size-[min(60vw,60vh)] items-center justify-center rounded-full border border-white/25">
        <span className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
        <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        <span key={n} className="type-display leader-num text-[min(30vw,30vh)] leading-none text-white">
          {n}
        </span>
      </div>
    </div>
  );
}

function useMagnetic(strength: number) {
  useEffect(() => {
    let raf = 0;
    let px = 0;
    let py = 0;
    const active = new Set<HTMLElement>();
    const frame = () => {
      raf = 0;
      const seen = new Set<HTMLElement>();
      for (const el of document.querySelectorAll<HTMLElement>("[data-magnetic]")) {
        const r = el.getBoundingClientRect();
        const reach = Math.max(40, Math.min(r.width, r.height));
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const inside = px > r.left - reach && px < r.right + reach && py > r.top - reach && py < r.bottom + reach;
        if (inside) {
          el.style.translate = `${((px - cx) * strength).toFixed(1)}px ${((py - cy) * strength).toFixed(1)}px`;
          seen.add(el);
          active.add(el);
        }
      }
      for (const el of active) {
        if (!seen.has(el)) {
          el.style.translate = "";
          active.delete(el);
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      for (const el of active) el.style.translate = "";
    };
  }, [strength]);
}

function Magnetic({ strength }: { strength: number }) {
  useMagnetic(strength);
  return null;
}

export default function SignatureMoments() {
  const { signature } = useBrandConfig();
  const num = useNumbers();
  const motionOk = useMediaQuery("(prefers-reduced-motion: no-preference)");

  // Rack focus is pure CSS, keyed off an attribute on <html>.
  useEffect(() => {
    const root = document.documentElement;
    if (signature.rackFocus) root.dataset.rackFocus = "";
    else delete root.dataset.rackFocus;
  }, [signature.rackFocus]);

  if (!motionOk) return null;
  return (
    <>
      {signature.slateWipe && <SlateWipe />}
      {signature.scrollTimecode && <ScrollTimecode fps={num("signature.timecodeFps")} />}
      {signature.leaderCountdown && <LeaderCountdown />}
      {signature.magneticCtas && <Magnetic strength={num("signature.magnetStrength")} />}
    </>
  );
}
