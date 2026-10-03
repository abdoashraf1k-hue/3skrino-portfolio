"use client";

import { useSyncExternalStore } from "react";

/**
 * Hero ambient loop. Off unless the admin enables it; even then it only
 * starts after the visitor interacts with the page (autoplay policy), fades
 * in over 2s, and the nav's mute button silences it (choice persists).
 *
 * With no file configured it synthesises the bed: a low detuned drone under
 * a slowly swelling filtered-noise "breath".
 */

const KEY = "3skrino-ambient";
const EVENT = "3skrino:ambient";
const VOLUME = 0.05;
const FADE_IN = 2;
const FADE_OUT = 0.8;

/* ------------------------------------------------------------------ */
/* Visitor mute + "is there anything to mute" (the hero is mounted)     */
/* ------------------------------------------------------------------ */
let available = false;

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useAmbientMuted(): boolean {
  return useSyncExternalStore(subscribe, readMuted, () => false);
}

export function useAmbientAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => available, () => false);
}

export function setAmbientAvailable(on: boolean): void {
  if (available === on) return;
  available = on;
  emit();
}

export function toggleAmbientMuted(): void {
  try {
    localStorage.setItem(KEY, readMuted() ? "on" : "off");
  } catch {
    // Blocked storage — the toggle won't persist, but still applies via the event.
  }
  emit();
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */
/** `kick` re-tries anything the autoplay policy blocked (a file's play()). */
type Engine = { ctx: AudioContext; master: GainNode; stop: () => void; kick: () => void };
type Source = { stop: () => void; kick: () => void };
let engine: Engine | null = null;
let engineSrc: string | null = null;

function buildSynth(ctx: AudioContext, out: AudioNode): Source {
  const nodes: AudioScheduledSourceNode[] = [];

  // Drone: root + fifth + a soft octave, slightly detuned, through a breathing low-pass.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.Q.value = 0.7;
  filter.connect(out);
  for (const [freq, type, gain, detune] of [
    [55, "sine", 0.55, -4],
    [82.4, "sine", 0.35, 5],
    [110.3, "triangle", 0.12, 0],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(filter);
    nodes.push(osc);
  }
  const sweep = ctx.createOscillator();
  sweep.frequency.value = 0.07;
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 220;
  sweep.connect(sweepDepth).connect(filter.frequency);
  nodes.push(sweep);

  // Breath: looping noise, band-passed, swelling every ~5.5s.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 480;
  band.Q.value = 0.8;
  const breath = ctx.createGain();
  breath.gain.value = 0.18;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.18;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.18;
  lfo.connect(lfoDepth).connect(breath.gain);
  src.connect(band).connect(breath).connect(out);
  nodes.push(src, lfo);

  for (const n of nodes) n.start();
  return {
    kick: () => undefined,
    stop: () => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          // already stopped
        }
      }
    },
  };
}

function buildFile(ctx: AudioContext, out: AudioNode, src: string): Source {
  const el = new Audio(src);
  el.loop = true;
  el.crossOrigin = "anonymous";
  ctx.createMediaElementSource(el).connect(out);
  return {
    kick: () => {
      if (el.paused) void el.play().catch(() => undefined);
    },
    stop: () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
    },
  };
}

function ensureEngine(src: string): Engine | null {
  if (engine && engineSrc === src) return engine;
  disposeAmbient();
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    engine = { ctx, master, ...(src ? buildFile(ctx, master, src) : buildSynth(ctx, master)) };
    engineSrc = src;
    return engine;
  } catch {
    return null; // no audio device — silence is fine
  }
}

function ramp(e: Engine, to: number, seconds: number) {
  const t = e.ctx.currentTime;
  const g = e.master.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(to, t + seconds);
}

/**
 * Fades the loop in. Resolves false while the browser still blocks audio
 * (no user gesture yet) — call again from the next interaction.
 */
export async function startAmbient(src: string): Promise<boolean> {
  const e = ensureEngine(src);
  if (!e) return false;
  if (e.ctx.state !== "running") {
    try {
      await e.ctx.resume();
    } catch {
      return false;
    }
  }
  if (e.ctx.state !== "running" || engine !== e) return false;
  e.kick();
  ramp(e, VOLUME, FADE_IN);
  return true;
}

/** Fades the loop out (keeps the engine, so un-muting resumes instantly). */
export function stopAmbient(): void {
  if (engine) ramp(engine, 0, FADE_OUT);
}

export function disposeAmbient(): void {
  if (!engine) return;
  const e = engine;
  engine = null;
  engineSrc = null;
  e.stop();
  void e.ctx.close().catch(() => undefined);
}
