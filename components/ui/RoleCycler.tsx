"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useHeroConfig } from "@/lib/hero-config-client";
import { useMediaQuery } from "@/lib/hooks";
import { cn, EASE_OUT } from "@/lib/utils";

const STATIC_ROLE = "Creative Studio";

/**
 * The nav's descriptor: crossfades + slides through the roles from the hero
 * config. Every role is stacked invisibly in the same grid cell so the slot
 * is as wide as the longest one and the nav never reflows. Reduced motion →
 * a static "Creative Studio". Screen readers get the full list once.
 */
export default function RoleCycler({ className }: { className?: string }) {
  const { roles } = useHeroConfig();
  // useMediaQuery (not framer's hook) — it reports false while hydrating, so server and client markup match.
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [index, setIndex] = useState(0);
  const items = roles.items.length ? roles.items : [STATIC_ROLE];
  const ms = Math.max(1.5, roles.interval) * 1000;

  useEffect(() => {
    if (reduced || items.length < 2) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => i + 1);
    }, ms);
    return () => window.clearInterval(id);
  }, [reduced, items.length, ms]);

  const current = reduced ? STATIC_ROLE : items[index % items.length];

  return (
    <span className={cn("relative inline-grid", className)}>
      <span className="sr-only">{reduced ? STATIC_ROLE : items.join(", ")}</span>
      {(reduced ? [STATIC_ROLE] : items).map((r) => (
        <span key={r} aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">
          {r}
        </span>
      ))}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={current}
          aria-hidden
          className="col-start-1 row-start-1 whitespace-nowrap"
          initial={{ opacity: 0, y: "0.7em", filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: "-0.7em", filter: "blur(3px)" }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        >
          {current}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
