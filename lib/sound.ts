"use client";

/**
 * Tiny Web Audio sound kit — every sound is synthesised at runtime,
 * so there are no audio files to ship. Muted by default; the choice is
 * remembered per browser.
 */

export type SoundName = "snip" | "rewind" | "projector";

const STORAGE_KEY = "3skrino:sound";
const listeners = new Set<() => void>();
let muted = true;
let hydrated = false;
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function readStored() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) !== "on";
  } catch {
    muted = true;
  }
}

export function subscribeSound(onChange: () => void) {
  readStored();
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export const getMuted = () => {
  readStored();
  return muted;
};
export const getMutedServer = () => true;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    // One second of white noise, reused by every sound.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function toggleMuted() {
  muted = !muted;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  if (!muted) {
    ensureContext();
    play("snip");
  }
  listeners.forEach((l) => l());
}

function noiseBurst(ac: AudioContext, at: number, length: number, freq: number, gain: number, type: BiquadFilterType) {
  if (!noise) return;
  const src = ac.createBufferSource();
  src.buffer = noise;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(at, Math.random() * 0.5, length + 0.02);
}

export function play(name: SoundName) {
  if (muted) return;
  const ac = ensureContext();
  if (!ac) return;
  const t = ac.currentTime;

  if (name === "snip") {
    noiseBurst(ac, t, 0.035, 4200, 0.12, "bandpass");
    noiseBurst(ac, t + 0.045, 0.025, 6000, 0.07, "bandpass");
  }

  if (name === "rewind") {
    const osc = ac.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(filter).connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.26);
    noiseBurst(ac, t, 0.25, 2500, 0.03, "highpass");
  }

  if (name === "projector") {
    for (let i = 0; i < 3; i++) noiseBurst(ac, t + i * 0.07, 0.018, 1400, 0.16, "lowpass");
  }
}
