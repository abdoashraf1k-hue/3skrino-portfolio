"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { gsap } from "@/lib/gsap";
import { RICH_MOTION_QUERY, useMediaQuery } from "@/lib/hooks";

/* ------------------------------------------------------------------ */
/* Context — lets app/template.tsx know a client navigation happened   */
/* ------------------------------------------------------------------ */
const TransitionContext = createContext({ hasNavigated: false });
export const usePageTransition = () => useContext(TransitionContext);

/* ------------------------------------------------------------------ */
/* Iris — 6 blades, each a half-plane pushed in to distance r          */
/* ------------------------------------------------------------------ */
type IrisHandle = { close: () => Promise<void>; open: () => Promise<void> };

const BLADES = 6;
const R_OPEN = 80; // viewBox units — beyond the visible corners
const R_CLOSED = -2; // slight overlap so no pinhole survives
const TWIST = 60; // degrees the whole iris rotates while closing
const CLOSE_S = 0.35;
const OPEN_S = 0.35;

function Iris({ rich, ref }: { rich: boolean; ref: Ref<IrisHandle> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bladeRefs = useRef<(SVGGElement | null)[]>([]);
  const fadeRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const state = useRef({ r: R_OPEN });

  const render = () => {
    const { r } = state.current;
    const twist = (1 - (r - R_CLOSED) / (R_OPEN - R_CLOSED)) * TWIST;
    bladeRefs.current.forEach((blade, i) => {
      blade?.setAttribute("transform", `rotate(${i * (360 / BLADES) + twist}) translate(0 ${-r})`);
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      close: () =>
        new Promise<void>((resolve) => {
          const root = rootRef.current;
          if (!root) return resolve();
          gsap.killTweensOf([state.current, fadeRef.current, labelRef.current]);
          gsap.set(root, { visibility: "visible" });
          gsap.set(labelRef.current, { opacity: 0 });
          const tl = gsap.timeline({
            onComplete: () => {
              // A 150ms "LOADING" blink while the iris is shut — runs alongside, never delays.
              gsap
                .timeline()
                .to(labelRef.current, { opacity: 1, duration: 0.04, ease: "none" })
                .to(labelRef.current, { opacity: 0, duration: 0.04, ease: "none" }, 0.11);
              resolve();
            },
          });
          if (rich) {
            gsap.set(fadeRef.current, { opacity: 0 });
            tl.fromTo(state.current, { r: R_OPEN }, { r: R_CLOSED, duration: CLOSE_S, ease: "power3.inOut", onUpdate: render });
          } else {
            tl.fromTo(fadeRef.current, { opacity: 0 }, { opacity: 1, duration: CLOSE_S, ease: "power2.out" });
          }
        }),
      open: () =>
        new Promise<void>((resolve) => {
          const root = rootRef.current;
          if (!root) return resolve();
          const done = () => {
            gsap.set(root, { visibility: "hidden" });
            resolve();
          };
          gsap.killTweensOf(labelRef.current);
          gsap.set(labelRef.current, { opacity: 0 });
          if (rich) {
            gsap.fromTo(state.current, { r: R_CLOSED }, { r: R_OPEN, duration: OPEN_S, ease: "power3.inOut", onUpdate: render, onComplete: done });
          } else {
            gsap.to(fadeRef.current, { opacity: 0, duration: OPEN_S, ease: "power2.inOut", onComplete: done });
          }
        }),
    }),
    [rich],
  );

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none fixed inset-0 z-[95]" style={{ visibility: "hidden" }}>
      {rich ? (
        <svg className="absolute inset-0 size-full" viewBox="-50 -50 100 100" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: BLADES }, (_, i) => (
            <g
              key={i}
              ref={(el) => {
                bladeRefs.current[i] = el;
              }}
              transform={`rotate(${i * (360 / BLADES)}) translate(0 ${-R_OPEN})`}
            >
              <rect x="-160" y="-320" width="320" height="320" fill="var(--bg)" />
              <line x1="-160" y1="0" x2="160" y2="0" stroke="var(--accent)" strokeOpacity="0.6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
      ) : null}
      <div ref={fadeRef} className="absolute inset-0 bg-bg opacity-0" />
      <span
        ref={labelRef}
        className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-accent opacity-0"
      >
        Loading
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Provider — intercepts internal link clicks                          */
/* ------------------------------------------------------------------ */
export default function PageTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const rich = useMediaQuery(RICH_MOTION_QUERY);
  const irisRef = useRef<IrisHandle>(null);
  const busy = useRef(false);
  const fallback = useRef(0);
  const [target, setTarget] = useState<string | null>(null);
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest("a, button");
      if (!el) return;

      const anchor = el instanceof HTMLAnchorElement ? el : null;
      const isTransition =
        anchor !== null &&
        !e.defaultPrevented &&
        e.button === 0 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        (!anchor.target || anchor.target === "_self") &&
        !anchor.hasAttribute("download") &&
        (() => {
          const url = new URL(anchor.href, window.location.href);
          return url.origin === window.location.origin && url.pathname !== window.location.pathname;
        })();

      if (!isTransition || !anchor) return;

      // Hold the navigation until the iris has closed.
      e.preventDefault();
      if (busy.current) return;
      busy.current = true;
      const url = new URL(anchor.href, window.location.href);
      setHasNavigated(true);

      void (irisRef.current?.close() ?? Promise.resolve()).then(() => {
        setTarget(url.pathname);
        router.push(url.pathname + url.search + url.hash);
        // Never leave the screen shut if a navigation stalls.
        window.clearTimeout(fallback.current);
        fallback.current = window.setTimeout(() => {
          if (!busy.current) return;
          void irisRef.current?.open();
          busy.current = false;
          setTarget(null);
        }, 8000);
      });
    };

    // Capture phase: runs before next/link's own click handler.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);

  // New route is on screen → wait 200ms, then open the iris.
  const arrived = target !== null && pathname === target;
  useEffect(() => {
    if (!arrived) return;
    window.clearTimeout(fallback.current);
    const id = window.setTimeout(() => {
      setTarget(null);
      void irisRef.current?.open().then(() => {
        busy.current = false;
      });
    }, 200);
    return () => window.clearTimeout(id);
  }, [arrived]);

  return (
    <TransitionContext.Provider value={{ hasNavigated }}>
      {children}
      <Iris ref={irisRef} rich={rich} />
    </TransitionContext.Provider>
  );
}
