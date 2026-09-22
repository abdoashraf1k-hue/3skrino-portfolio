"use client";

import { AnimatePresence, motion } from "framer-motion";
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

export default function Navigation() {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(subscribeScroll, getScrolled, getScrolledServer);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
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
            className="justify-self-start text-sm font-black uppercase tracking-widest"
          >
            {site.name}
          </Link>

          <ul className="hidden items-center justify-center gap-8 md:flex">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.href} className="relative">
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

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="justify-self-end font-mono text-[11px] uppercase tracking-widest md:hidden"
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
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
