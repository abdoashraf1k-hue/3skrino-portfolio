"use client";

import { useEffect, useRef } from "react";
import CursorShape, { CURSOR_SCALE } from "@/components/ui/CursorShape";
import { colorCss, useCinematic } from "@/lib/cinematic";
import { gsap } from "@/lib/gsap";

/**
 * The custom cursor (admin → Cursor Studio): a small dot that tracks the
 * pointer, a lagging ring layer in the chosen style (dot / ring / crosshair /
 * playhead / aperture) that reacts over anything interactive, an optional
 * trail, and a mono label from the hovered element's data-cursor-label.
 */
const HOVER_SELECTOR = "[data-hover], a, button, [role='button'], label";

export default function Cursor() {
  const cursor = useCinematic().cursor;
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const trailLength = cursor.trail.enabled ? cursor.trail.length : 0;

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    const label = labelRef.current;
    if (!dot || !ring || !label) return;
    if (!window.matchMedia("(pointer: fine) and (min-width: 768px)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const trail = trailRef.current ? Array.from(trailRef.current.children) as HTMLElement[] : [];

    gsap.set([dot, ring, ...trail], { xPercent: -50, yPercent: -50 });
    const moveDotX = gsap.quickTo(dot, "x", { duration: 0.15, ease: "power3.out" });
    const moveDotY = gsap.quickTo(dot, "y", { duration: 0.15, ease: "power3.out" });

    const mouse = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    const trailPos = trail.map(() => ({ x: -100, y: -100 }));
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
        for (const p of trailPos) Object.assign(p, mouse);
        gsap.to([dot, ring, ...trail], { opacity: 1, duration: 0.2 });
      }
    };

    // Ring lerps behind the pointer; each trail dot chases the one before it.
    const tick = () => {
      ringPos.x += (mouse.x - ringPos.x) * 0.2;
      ringPos.y += (mouse.y - ringPos.y) * 0.2;
      gsap.set(ring, { x: ringPos.x, y: ringPos.y });
      let lead = mouse;
      trailPos.forEach((p, i) => {
        p.x += (lead.x - p.x) * (reduced ? 1 : 0.38);
        p.y += (lead.y - p.y) * (reduced ? 1 : 0.38);
        gsap.set(trail[i], { x: p.x, y: p.y });
        lead = p;
      });
    };
    gsap.ticker.add(tick);

    const onOver = (e: MouseEvent) => {
      const el = e.target as Element | null;
      ring.dataset.mode = el?.closest(HOVER_SELECTOR) ? "hover" : "default";
      // The label is independent of hover: a whole 3D canvas can carry one without blooming the ring.
      const text = el?.closest<HTMLElement>("[data-cursor-label]")?.dataset.cursorLabel ?? "";
      if (label.textContent !== text) label.textContent = text;
    };

    const onLeave = () => {
      visible = false;
      gsap.to([dot, ring, ...trail], { opacity: 0, duration: 0.2 });
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
  }, [trailLength]);

  const k = CURSOR_SCALE[cursor.size];
  // The classic dot is the page's text colour; the other styles wear the cursor colour.
  const dotColor = cursor.style === "dot" ? "var(--fg)" : colorCss(cursor.color);
  const dot = Math.max(3, Math.round(4 * k));

  return (
    <>
      {trailLength > 0 && (
        <div ref={trailRef} aria-hidden>
          {Array.from({ length: trailLength }, (_, i) => {
            const t = 1 - i / trailLength;
            return (
              <div
                key={i}
                className="cursor-el pointer-events-none fixed left-0 top-0 z-[99] rounded-full opacity-0"
                style={{ width: dot * (0.4 + t * 0.9), height: dot * (0.4 + t * 0.9), background: colorCss(cursor.color), filter: `opacity(${t * 0.6})` }}
              />
            );
          })}
        </div>
      )}
      <div ref={ringRef} aria-hidden data-mode="default" className="cursor-el group pointer-events-none fixed left-0 top-0 z-[100] opacity-0">
        <CursorShape cursor={cursor} />
        <span
          ref={labelRef}
          className="absolute left-full top-full ml-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-widest text-accent empty:hidden"
        />
      </div>
      <div
        ref={dotRef}
        aria-hidden
        className="cursor-el pointer-events-none fixed left-0 top-0 z-[101] rounded-full opacity-0"
        style={{ width: dot, height: dot, background: dotColor }}
      />
    </>
  );
}
