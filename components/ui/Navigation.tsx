"use client";

import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Clock from "@/components/ui/Clock";
import NavTools from "@/components/ui/NavTools";
import RoleCycler from "@/components/ui/RoleCycler";
import SocialLinks from "@/components/ui/SocialLinks";
import { navLinks, site } from "@/data/site";
import { cn, EASE_OUT, pad } from "@/lib/utils";

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const getScrolled = () => window.scrollY > 40;
const getScrolledServer = () => false;

// "Is the page actively scrolling?" — true while scroll events keep arriving.
let scrolling = false;
function subscribeScrolling(onChange: () => void) {
  let timer = 0;
  const onScroll = () => {
    if (!scrolling) {
      scrolling = true;
      onChange();
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      scrolling = false;
      onChange();
    }, 300);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.clearTimeout(timer);
  };
}
const getScrolling = () => scrolling;

/** The menu opens as a circle growing out of the Menu button (top-right). */
const ORIGIN = "at calc(100% - 3rem) 2rem";

export default function Navigation() {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(subscribeScroll, getScrolled, getScrolledServer);
  const isScrolling = useSyncExternalStore(subscribeScrolling, getScrolling, getScrolledServer);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Mobile menu: Escape closes it (focus back on the toggle); the page behind doesn't scroll.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <>
      {/* Scroll progress */}
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className={cn(
          "fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-accent transition-shadow duration-300",
          isScrolling && "shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_40%,transparent)]",
        )}
      />
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: EASE_OUT }}
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-500",
          scrolled && !menuOpen ? "border-line bg-bg/60 backdrop-blur-xl" : "border-transparent bg-transparent",
        )}
      >
        <nav className="mx-auto grid h-16 w-full max-w-[1600px] grid-cols-2 items-center gap-6 px-6 md:grid-cols-[1fr_auto_1fr] md:px-12 lg:px-20">
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            className="wordmark flex min-w-0 items-center gap-2 justify-self-start text-sm font-black uppercase tracking-widest"
          >
            <span className="shrink-0">
              {site.name}
              <sup className="ml-0.5 font-mono text-[8px] font-normal text-muted">™</sup>
            </span>
            {/* Cycling descriptor — the wordmark column only has room for it on wide screens. */}
            <span className="hidden items-center gap-2 font-mono text-[10px] font-normal tracking-widest text-muted xl:inline-flex">
              <span aria-hidden className="text-fg/30">
                —
              </span>
              <RoleCycler />
            </span>
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full bg-accent-2 transition-opacity duration-300",
                isScrolling ? "animate-pulse opacity-100" : "opacity-0",
              )}
            />
          </Link>

          <ul className="hidden items-center justify-center gap-6 md:flex xl:gap-8">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.href} className="relative">
                  {active && (
                    <span aria-hidden className="absolute -left-2.5 top-1/2 size-1 -translate-y-1/2 rounded-full bg-accent" />
                  )}
                  <Link
                    href={link.href}
                    aria-label={link.label}
                    className={cn(
                      "whitespace-nowrap font-mono text-[11px] uppercase tracking-widest transition-colors duration-300",
                      active ? "text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    {/* Tablet / small desktop: "Vertical"; wide screens: "Vertical Cuts". */}
                    <span className="xl:hidden">{link.short}</span>
                    <span className="hidden xl:inline">{link.label}</span>
                  </Link>
                  {active && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-1.5 left-0 right-0 h-px bg-accent"
                      transition={{ duration: 0.5, ease: EASE_OUT }}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          <div className="hidden items-center justify-end gap-4 font-mono text-[10px] uppercase tracking-widest text-muted md:flex">
            <NavTools />
            <Clock className="hidden tabular-nums lg:inline" />
            <span className="hidden items-center gap-1.5 xl:flex">
              <span className="size-1.5 rounded-full bg-accent-2" />
              {site.location}
            </span>
          </div>

          <div className="relative z-10 flex items-center gap-3 justify-self-end md:hidden">
            <NavTools />
            <button
              ref={menuButton}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest"
            >
              <span className="relative block h-2.5 w-4" aria-hidden>
                <span
                  className={cn(
                    "absolute left-0 h-px w-full bg-current transition-[transform,top] duration-500",
                    menuOpen ? "top-1 rotate-45" : "top-0",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-0 h-px w-full bg-current transition-[transform,top] duration-500",
                    menuOpen ? "top-1 -rotate-45" : "top-2",
                  )}
                />
              </span>
              {menuOpen ? "Close" : "Menu"}
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ clipPath: `circle(0% ${ORIGIN})` }}
            animate={{ clipPath: `circle(150% ${ORIGIN})` }}
            exit={{ clipPath: `circle(0% ${ORIGIN})` }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-40 flex flex-col justify-between overflow-y-auto bg-bg px-6 pb-8 pt-24 md:hidden"
          >
            {/* Ghost wordmark */}
            <span
              aria-hidden
              className="type-display pointer-events-none absolute -bottom-[0.18em] -left-[0.04em] select-none text-[38vw] leading-none text-fg/[0.04]"
            >
              {site.name}
            </span>

            <div className="relative">
              <p className="mb-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                <span className="size-1.5 rounded-full bg-accent" />
                <RoleCycler />
              </p>
              <ul className="flex flex-col border-t border-line">
                {navLinks.map((link, i) => {
                  const active = isActive(link.href);
                  return (
                    <motion.li
                      key={link.href}
                      initial={{ opacity: 0, y: 40, rotate: 2 }}
                      animate={{ opacity: 1, y: 0, rotate: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      transition={{ duration: 0.7, delay: 0.25 + i * 0.07, ease: EASE_OUT }}
                      className="origin-left border-b border-line"
                    >
                      <Link
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className="group flex items-baseline gap-4 py-3"
                      >
                        <span className="font-mono text-[10px] text-muted">{pad(i + 1)}</span>
                        <span
                          className={cn(
                            "type-display text-[clamp(2.75rem,13vw,4.5rem)] leading-[0.95] transition-colors duration-300",
                            active ? "italic text-accent" : "text-fg group-active:text-accent",
                          )}
                        >
                          {link.label}
                        </span>
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="relative mt-10 flex flex-col gap-6"
            >
              <SocialLinks compact />
              <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
                <Clock className="tabular-nums" />
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-accent-2" />
                  {site.location}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
