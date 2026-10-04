"use client";

import type { SoundName, SoundSlot } from "@/data/site-config";

/**
 * UI sound engine for admin → Sound Studio. Each sound is synthesised with
 * WebAudio (no files to load) unless the slot has an uploaded mp3 / wav.
 * Browsers only allow audio after a user gesture, so anything requested
 * before the first click / key press is silently dropped.
 */

let ctx: AudioContext | null = null;
const files = new Map<string, HTMLAudioElement>();

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

/** One enveloped oscillator note. */
function tone(ac: AudioContext, out: AudioNode, at: number, freq: number, dur: number, type: OscillatorType, peak: number, to?: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.012, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** A band-passed noise sweep — the "whoosh" of a cut. */
function whoosh(ac: AudioContext, out: AudioNode, at: number, dur: number, peak: number) {
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(300, at);
  bp.frequency.exponentialRampToValueAtTime(2600, at + dur * 0.7);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(at);
  src.stop(at + dur);
}

const RECIPES: Record<SoundName, (ac: AudioContext, out: AudioNode, t: number) => void> = {
  hover: (ac, out, t) => tone(ac, out, t, 1500, 0.035, "sine", 0.05),
  click: (ac, out, t) => tone(ac, out, t, 950, 0.06, "triangle", 0.12, 520),
  transition: (ac, out, t) => whoosh(ac, out, t, 0.45, 0.22),
  notification: (ac, out, t) => {
    tone(ac, out, t, 880, 0.12, "sine", 0.12);
    tone(ac, out, t + 0.11, 1320, 0.16, "sine", 0.1);
  },
  error: (ac, out, t) => {
    tone(ac, out, t, 190, 0.11, "sawtooth", 0.07);
    tone(ac, out, t + 0.14, 160, 0.16, "sawtooth", 0.07);
  },
  success: (ac, out, t) => {
    [660, 880, 1320].forEach((f, i) => tone(ac, out, t + i * 0.07, f, 0.16, "sine", 0.1));
  },
};

/** Plays `name` at slot volume × master (both 0–100). Never throws. */
export function playUiSound(name: SoundName, slot: SoundSlot, master: number): void {
  const gain = (slot.volume / 100) * (master / 100);
  if (gain <= 0) return;
  // Before any gesture audio can't start — and a pending resume() would replay every queued hover at the first click.
  if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    if (slot.src) {
      let el = files.get(slot.src);
      if (!el) {
        el = new Audio(slot.src);
        el.preload = "auto";
        files.set(slot.src, el);
      }
      // Clone so rapid repeats overlap instead of restarting.
      const voice = el.cloneNode(true) as HTMLAudioElement;
      voice.volume = Math.min(1, gain);
      void voice.play().catch(() => undefined);
      return;
    }
    const ac = audio();
    if (!ac) return;
    const go = () => {
      const out = ac.createGain();
      out.gain.value = gain * 1.6;
      out.connect(ac.destination);
      RECIPES[name](ac, out, ac.currentTime + 0.005);
      window.setTimeout(() => out.disconnect(), 1200);
    };
    if (ac.state === "running") go();
    // resume() only succeeds after a user gesture — before that the request is dropped.
    else void ac.resume().then(() => ac.state === "running" && go(), () => undefined);
  } catch {
    // no audio device / blocked — silence is fine
  }
}
