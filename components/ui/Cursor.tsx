"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

const HOVER_SELECTOR = "[data-hover], a, button, [role='button']";

export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;
    if (!window.matchMedia("(pointer: fine) and (min-width: 769px)").matches) return;

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
      const target = e.target as Element | null;
      const hovering = Boolean(target?.closest(HOVER_SELECTOR));
      ring.dataset.active = hovering ? "true" : "false";
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

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        data-active="false"
        className="cursor-el pointer-events-none fixed left-0 top-0 z-[100] -ml-5 -mt-5 size-10 rounded-full border border-fg/30 opacity-0 transition-[width,height,margin,background-color,border-color] duration-300 ease-out data-[active=true]:-ml-[30px] data-[active=true]:-mt-[30px] data-[active=true]:size-[60px] data-[active=true]:border-accent data-[active=true]:bg-accent/10"
      />
      <div
        ref={dotRef}
        aria-hidden
        className="cursor-el pointer-events-none fixed left-0 top-0 z-[101] -ml-[3px] -mt-[3px] size-1.5 rounded-full bg-fg opacity-0"
      />
    </>
  );
}
