"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

/**
 * Cursor modes, resolved from the hovered element:
 *   [data-cursor="video"]  → filled "▶ 00:14" badge (label from data-cursor-label)
 *   [data-cursor="view"]   → viewfinder corner brackets (+ optional badge, e.g. "9:16")
 *   [data-cursor="nav"]    → small "+" that rotates 90°
 *   img / [data-thumb]     → viewfinder
 *   a, button, [data-hover]→ grown lime ring
 */
type Mode = "default" | "hover" | "nav" | "view" | "video";

const HOVER_SELECTOR = "[data-hover], a, button, [role='button'], label";

function resolve(target: Element | null): { mode: Mode; label: string } {
  if (!target) return { mode: "default", label: "" };
  const tagged = target.closest<HTMLElement>("[data-cursor]");
  if (tagged) {
    const mode = tagged.dataset.cursor as Mode;
    return { mode, label: tagged.dataset.cursorLabel ?? "" };
  }
  if (target.closest("img, [data-thumb]")) return { mode: "view", label: "" };
  if (target.closest(HOVER_SELECTOR)) return { mode: "hover", label: "" };
  return { mode: "default", label: "" };
}

export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    const label = labelRef.current;
    if (!dot || !ring || !label) return;
    if (!window.matchMedia("(pointer: fine) and (min-width: 768px)").matches) return;

    gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });
    const moveDotX = gsap.quickTo(dot, "x", { duration: 0.15, ease: "power3.out" });
    const moveDotY = gsap.quickTo(dot, "y", { duration: 0.15, ease: "power3.out" });

    const mouse = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    let visible = false;

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      moveDotX(mouse.x);
      moveDotY(mouse.y);
      if (!visible) {
        visible = true;
        ringPos.x = mouse.x;
        ringPos.y = mouse.y;
        gsap.to([dot, ring], { opacity: 1, duration: 0.3 });
      }
    };

    // Ring lerps behind the pointer.
    const tick = () => {
      ringPos.x += (mouse.x - ringPos.x) * 0.12;
      ringPos.y += (mouse.y - ringPos.y) * 0.12;
      gsap.set(ring, { x: ringPos.x, y: ringPos.y });
    };
    gsap.ticker.add(tick);

    const onOver = (e: MouseEvent) => {
      const { mode, label: text } = resolve(e.target as Element | null);
      ring.dataset.mode = mode;
      dot.dataset.mode = mode;
      ring.dataset.label = text ? "on" : "off";
      if (text) label.textContent = text;
    };

    const onLeave = () => {
      visible = false;
      gsap.to([dot, ring], { opacity: 0, duration: 0.3 });
    };

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const bracket = "absolute size-2.5 border-accent opacity-0 transition-opacity duration-300 group-data-[mode=view]:opacity-100";

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        data-mode="default"
        data-label="off"
        className="cursor-el group pointer-events-none fixed left-0 top-0 z-[100] size-10 rounded-full border border-fg/30 opacity-0 transition-[width,height,background-color,border-color,border-radius] duration-300 ease-out data-[mode=hover]:size-[60px] data-[mode=hover]:border-accent data-[mode=hover]:bg-accent/10 data-[mode=nav]:size-5 data-[mode=nav]:border-transparent data-[mode=video]:size-3 data-[mode=video]:border-transparent data-[mode=view]:size-[72px] data-[mode=view]:rounded-none data-[mode=view]:border-transparent"
      >
        {/* Viewfinder corners */}
        <span className={`${bracket} left-0 top-0 border-l border-t`} />
        <span className={`${bracket} right-0 top-0 border-r border-t`} />
        <span className={`${bracket} bottom-0 left-0 border-b border-l`} />
        <span className={`${bracket} bottom-0 right-0 border-b border-r`} />

        {/* Nav "+" */}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-[opacity,transform] duration-300 group-data-[mode=nav]:rotate-90 group-data-[mode=nav]:opacity-100">
          <span className="absolute h-px w-3 bg-accent" />
          <span className="absolute h-3 w-px bg-accent" />
        </span>

        {/* Text badge: "▶ 00:14" for video, "9:16" / "16:9" under the viewfinder */}
        <span
          ref={labelRef}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-75 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-bg opacity-0 transition-[opacity,transform] duration-300 group-data-[label=on]:scale-100 group-data-[label=on]:opacity-100 group-data-[mode=view]:top-[calc(100%+14px)]"
        />
      </div>
      <div
        ref={dotRef}
        aria-hidden
        data-mode="default"
        className="cursor-el pointer-events-none fixed left-0 top-0 z-[101] size-1.5 rounded-full bg-fg opacity-0 transition-[background-color] duration-300 data-[mode=nav]:bg-transparent data-[mode=video]:bg-transparent data-[mode=view]:bg-accent"
      />
    </>
  );
}
