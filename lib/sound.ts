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
  return readSoundPref() === "on";
}

/**
 * The visitor's explicit choice: "on" / "off", or null when they never
 * chose. Site UI sounds (admin → Sound Studio) follow the admin's switch
 * until the visitor picks; the palette tick stays opt-in.
 */
export function readSoundPref(): "on" | "off" | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
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

/**
 * A short intake of breath: band-passed noise with a fast swell — the
 * Confrontation hero's surprise. Same opt-in as tick().
 */
export function gasp(): void {
  if (!read() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.32);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(900, t);
    band.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    band.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.32);
  } catch {
    // no audio device / blocked autoplay — silent is fine
  }
}
