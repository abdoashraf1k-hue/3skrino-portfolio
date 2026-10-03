"use client";

import { MotionConfig } from "framer-motion";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { setLenis } from "@/lib/scroll";

export default function SmoothScroll({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ duration: 1.2, lerp: 0.08, smoothWheel: true });
    lenisRef.current = lenis;
    setLenis(lenis);
    lenis.on("scroll", ScrollTrigger.update);

    // Drive Lenis from GSAP's RAF loop so ScrollTrigger stays in sync.
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenisRef.current = null;
      setLenis(null);
    };
  }, []);

  // Reset scroll + recalc triggers on route change.
  useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true });
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  // reducedMotion="user" makes every framer-motion animation respect the OS setting.
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
