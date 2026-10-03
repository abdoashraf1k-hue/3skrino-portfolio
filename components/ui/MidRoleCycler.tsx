"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { HeroConfig } from "@/data/hero-config";
import { useMediaQuery } from "@/lib/hooks";
import { useHeroConfig } from "@/lib/live-config";
import { cn, EASE_OUT } from "@/lib/utils";

const STATIC_ROLE = "Creative Studio";

/**
 * The big mid-screen line the hero hands over to as it scrolls away: the
 * roles from admin → Roles, crossfading + rising every `interval` seconds —
 * the same rhythm as the nav's cycler, at cinematic size. A role of two or
 * more words breaks onto two lines with an accent slash ("VIDEO / EDITOR").
 * Reduced motion → a static "CREATIVE / STUDIO".
 */
export default function MidRoleCycler({ className, roles: rolesProp }: { className?: string; roles?: HeroConfig["roles"] }) {
  const live = useHeroConfig().roles;
  const roles = rolesProp ?? live;
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
  const words = current.split(/\s+/);
  const [first, ...rest] = words;

  return (
    // The default size applies only when the caller doesn't set its own (no class merging here).
    <p className={cn("type-display relative grid text-center leading-[0.86]", className ?? "text-[clamp(4rem,13vw,12rem)]")}>
      <span className="sr-only">{reduced ? STATIC_ROLE : items.join(", ")}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={current}
          aria-hidden
          className="col-start-1 row-start-1 block"
          initial={{ opacity: 0, y: "0.35em", filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: "-0.3em", filter: "blur(10px)" }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          {rest.length ? (
            <>
              {first} <span className="text-accent">/</span>
              <br />
              {rest.join(" ")}
            </>
          ) : (
            first
          )}
        </motion.span>
      </AnimatePresence>
    </p>
  );
}
