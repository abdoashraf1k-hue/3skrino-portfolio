"use client";

import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import Clock from "@/components/ui/Clock";
import { navLinks, site } from "@/data/site";
import { cn, EASE_OUT } from "@/lib/utils";

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

export default function Navigation() {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(subscribeScroll, getScrolled, getScrolledServer);
  const isScrolling = useSyncExternalStore(subscribeScrolling, getScrolling, getScrolledServer);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

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
          scrolled || menuOpen
            ? "border-line bg-bg/60 backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        <nav className="mx-auto grid h-16 w-full max-w-[1600px] grid-cols-2 items-center px-6 md:grid-cols-3 md:px-12 lg:px-20">
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            className="wordmark flex items-center gap-2 justify-self-start text-sm font-black uppercase tracking-widest"
          >
            <span>
              {site.name}
              <sup className="ml-0.5 font-mono text-[8px] font-normal text-muted">™</sup>
            </span>
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full bg-accent-2 transition-opacity duration-300",
                isScrolling ? "animate-pulse opacity-100" : "opacity-0",
              )}
            />
          </Link>

          <ul className="hidden items-center justify-center gap-8 md:flex">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.href} className="relative">
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -left-2.5 top-1/2 size-1 -translate-y-1/2 rounded-full bg-accent"
                    />
                  )}
                  <Link
                    href={link.href}
                    className={cn(
                      "font-mono text-[11px] uppercase tracking-widest transition-colors duration-300",
                      active ? "text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    {link.label}
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
            <Clock className="tabular-nums" />
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-accent-2" />
              {site.location}
            </span>
          </div>

          <div className="flex items-center gap-4 justify-self-end md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="font-mono text-[11px] uppercase tracking-widest"
            >
              {menuOpen ? "Close" : "Menu"}
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="fixed inset-0 z-40 flex flex-col justify-between bg-bg px-6 pb-10 pt-28 md:hidden"
          >
            <ul className="flex flex-col gap-2">
              {navLinks.map((link, i) => (
                <motion.li
                  key={link.href}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.05 + i * 0.06, ease: EASE_OUT }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "text-5xl font-black uppercase tracking-tight",
                      isActive(link.href) ? "text-accent" : "text-fg",
                    )}
                  >
                    {link.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
            <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
              <Clock className="tabular-nums" />
              <span>● {site.location}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
