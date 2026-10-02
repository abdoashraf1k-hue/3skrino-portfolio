"use client";

import { useSyncExternalStore } from "react";

/**
 * Optional UI sound: a soft, short "tick" (synthesised with WebAudio — no
 * files) for the command palette. Off by default; the choice persists.
 */

const KEY = "3skrino-sound";
const EVENT = "3skrino:sound";
let ctx: AudioContext | null = null;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    read,
    () => false,
  );
}

export function toggleSound(): boolean {
  const next = !read();
  try {
    localStorage.setItem(KEY, next ? "on" : "off");
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
  if (next) tick(880);
  return next;
}

export function tick(freq = 660): void {
  if (!read() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.05);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch {
    // no audio device / blocked autoplay — silent is fine
  }
}
