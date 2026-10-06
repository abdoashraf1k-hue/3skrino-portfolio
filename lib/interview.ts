"use client";

import Fuse from "fuse.js";
import type { InterviewQuestion } from "@/data/hero-config";

/**
 * The Interview hero's brain: route a typed question to the closest answer
 * (keywords first, then fuzzy over questions + keywords), and the Web Speech
 * plumbing — voices, an utterance with word boundaries, and a cancel that
 * never throws.
 */

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Best match, or null when nothing is close enough (→ the fallback answer). */
export function matchQuestion(input: string, questions: InterviewQuestion[]): InterviewQuestion | null {
  const q = input.trim();
  if (!q || !questions.length) return null;
  const typed = new Set(words(q));

  // 1. Keyword hits (a multi-word keyword must appear as a phrase).
  let best: { q: InterviewQuestion; score: number } | null = null;
  const lower = ` ${words(q).join(" ")} `;
  for (const item of questions) {
    let score = 0;
    for (const k of item.keywords) {
      if (k.includes(" ") ? lower.includes(` ${k} `) : typed.has(k)) score += k.length > 3 ? 2 : 1;
    }
    if (score && (!best || score > best.score)) best = { q: item, score };
  }
  if (best && best.score >= 2) return best.q;

  // 2. Fuzzy over the question text and keywords.
  const fuse = new Fuse(questions, {
    keys: [
      { name: "question", weight: 0.6 },
      { name: "keywords", weight: 0.4 },
    ],
    threshold: 0.45,
    ignoreLocation: true,
    includeScore: true,
  });
  const hit = fuse.search(q)[0];
  if (hit && (hit.score ?? 1) < 0.45) return hit.item;
  return best?.q ?? null;
}

/** Sentences with the char offset each starts at (subtitles page by sentence). */
export function sentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (m[0].trim()) out.push({ text: m[0].trim(), start: m.index });
  return out;
}

/** Word start offsets, to map a speech boundary's charIndex → word index. */
export function wordStarts(text: string): number[] {
  const out: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m.index);
  return out;
}

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** Voices load asynchronously in Chrome — resolve once they're there (or after a short wait). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    window.setTimeout(done, 1200);
  });
}

export function cancelSpeech(): void {
  try {
    if (speechSupported()) window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

export type SpeakOptions = { voice: string; rate: number; pitch: number; volume: number };

/**
 * Speaks `text`; `onWord` gets each word index as the engine reaches it,
 * `onEnd` fires once (end, error or cancel). Returns false when speech isn't
 * available so the caller can fall back to timed subtitles.
 */
export function speak(text: string, opts: SpeakOptions, onWord: (i: number) => void, onEnd: () => void): boolean {
  if (!speechSupported()) return false;
  cancelSpeech();
  const u = new SpeechSynthesisUtterance(text);
  const voice = opts.voice ? window.speechSynthesis.getVoices().find((v) => v.name === opts.voice) : undefined;
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? document.documentElement.lang ?? "en";
  u.rate = opts.rate;
  u.pitch = opts.pitch;
  u.volume = opts.volume;
  const starts = wordStarts(text);
  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= e.charIndex) i++;
    onWord(i);
  };
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    onEnd();
  };
  u.onend = end;
  u.onerror = end;
  window.speechSynthesis.speak(u);
  return true;
}
