"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { EASE_OUT } from "@/lib/utils";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "3skrino-install-dismissed";
const SHOW_AFTER_MS = 25_000;

/**
 * Registers /sw.js (production only — a service worker in dev caches stale
 * bundles) and offers a quiet "Install app" pill once the browser says the
 * site is installable. Dismissing it is remembered.
 */
export default function PwaManager() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  useEffect(() => {
    let timer = 0;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        // ignore
      }
      setPrompt(e as InstallPromptEvent);
      timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    };
    const onInstalled = () => {
      setVisible(false);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  const install = async () => {
    if (!prompt) return;
    setVisible(false);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "dismissed") dismiss();
    setPrompt(null);
  };

  return (
    <AnimatePresence>
      {visible && prompt && (
        <motion.div
          role="dialog"
          aria-label="Install app"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="fixed bottom-6 left-6 z-[65] flex items-center gap-4 border border-line bg-bg-soft/95 py-2 pl-4 pr-2 shadow-2xl backdrop-blur"
        >
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            <span className="text-accent">●</span> Take the portfolio offline
          </span>
          <button
            type="button"
            onClick={() => void install()}
            className="bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#0a0a0a]"
          >
            Install app
          </button>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="px-1 text-muted hover:text-fg">
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
