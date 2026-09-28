"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

/**
 * Two modes: a small dot by default, plus a thin lime ring over anything
 * interactive (links, buttons, [data-hover]).
 */
const HOVER_SELECTOR = "[data-hover], a, button, [role='button'], label";

export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;
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
        gsap.to([dot, ring], { opacity: 1, duration: 0.2 });
      }
    };

    // Ring lerps behind the pointer.
    const tick = () => {
      ringPos.x += (mouse.x - ringPos.x) * 0.2;
      ringPos.y += (mouse.y - ringPos.y) * 0.2;
      gsap.set(ring, { x: ringPos.x, y: ringPos.y });
    };
    gsap.ticker.add(tick);

    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      ring.dataset.mode = target?.closest(HOVER_SELECTOR) ? "hover" : "default";
    };

    const onLeave = () => {
      visible = false;
      gsap.to([dot, ring], { opacity: 0, duration: 0.2 });
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

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        data-mode="default"
        className="cursor-el group pointer-events-none fixed left-0 top-0 z-[100] size-12 opacity-0"
      >
        <span className="block size-full scale-50 rounded-full border border-accent opacity-0 transition-[transform,opacity] duration-200 ease-out group-data-[mode=hover]:scale-100 group-data-[mode=hover]:opacity-100" />
      </div>
      <div
        ref={dotRef}
        aria-hidden
        className="cursor-el pointer-events-none fixed left-0 top-0 z-[101] size-1 rounded-full bg-fg opacity-0"
      />
    </>
  );
}
