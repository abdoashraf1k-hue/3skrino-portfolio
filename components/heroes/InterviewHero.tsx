"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { HeroConfig, HeroPose, InterviewConfig } from "@/data/hero-config";
import { useNumbers, useText } from "@/lib/brand";
import { RICH_MOTION_QUERY, useMediaQuery } from "@/lib/hooks";
import { cancelSpeech, matchQuestion, sentences, speak, speechSupported, wordStarts } from "@/lib/interview";
import { useBrandConfig, useHeroConfig } from "@/lib/live-config";
import { CONTAINER, cn, pad } from "@/lib/utils";
import { HeroCtas, poseMap } from "./shared";

/**
 * Hero B — "The Interview". A late-night TV set: the portrait inside a CRT,
 * preset questions and a free-text box below. Each answer is read aloud
 * (Web Speech), subtitled word by word, with a lip-flap between the talking
 * and resting poses and a waveform under the screen. After `maxQuestions`
 * answers: "Thank you for watching".
 *
 * Phones / reduced motion: the same flow, text only (no voice), no CRT.
 */

type Phase = "waiting" | "thinking" | "speaking" | "done";
type Turn = { id: string; question: string; answer: string };

const THINK_MS = 650;
const SETTLE_MS = 900;

function Waveform({ bars, active, animate }: { bars: number; active: boolean; animate: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    const levels = new Array<number>(bars).fill(0.08);
    let raf = 0;
    let t = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      t += 1;
      const kids = el.children;
      for (let i = 0; i < bars; i++) {
        // Speech-ish envelope: a slow syllable pulse times per-bar jitter, louder mid-band.
        const mid = 1 - Math.abs(i / (bars - 1) - 0.5) * 1.3;
        const target = active ? (0.25 + 0.75 * Math.abs(Math.sin(t * 0.21 + i * 0.7)) * Math.random()) * mid : 0.06;
        levels[i] += (target - levels[i]) * 0.35;
        (kids[i] as HTMLElement | undefined)?.style.setProperty("transform", `scaleY(${Math.max(0.04, levels[i]).toFixed(3)})`);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [bars, active, animate]);
  return (
    <div ref={ref} aria-hidden className="flex h-10 items-center gap-[3px]">
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="h-full w-[3px] origin-center rounded-full bg-accent/80" style={{ transform: `scaleY(${active ? 0.4 : 0.06})` }} />
      ))}
    </div>
  );
}

export function InterviewSet({ hero, config, live, embedded = false }: { hero: HeroConfig; config: InterviewConfig; live: boolean; embedded?: boolean }) {
  const t = useText();
  const num = useNumbers();
  const brand = useBrandConfig();
  const poses = useMemo(() => poseMap(hero), [hero]);
  const center = hero.poses.ladder[Math.floor(hero.poses.ladder.length / 2)];
  const pick = useCallback((id: string): HeroPose => poses.get(id) ?? center, [poses, center]);

  const voiceAllowed = live && config.tts.enabled;
  const [muted, setMuted] = useState(false);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [word, setWord] = useState(-1);
  const [flap, setFlap] = useState(false);
  const [draft, setDraft] = useState("");
  const timers = useRef<number[]>([]);
  const lastBoundary = useRef(0);

  const clearTimers = () => {
    for (const id of timers.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    timers.current = [];
  };
  useEffect(
    () => () => {
      clearTimers();
      cancelSpeech();
    },
    [],
  );

  const lipFlap = num("interview.lipFlap");
  const wps = num("interview.wordsPerSecond");

  const finish = useCallback(
    (count: number) => {
      setWord(Number.MAX_SAFE_INTEGER);
      timers.current.push(
        window.setTimeout(() => {
          setPhase(count >= config.maxQuestions ? "done" : "waiting");
        }, SETTLE_MS),
      );
    },
    [config.maxQuestions],
  );

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || phase === "thinking" || phase === "speaking" || phase === "done") return;
    const hit = matchQuestion(q, config.questions);
    const text = hit?.answer ?? config.fallback;
    const count = turns.length + 1;
    clearTimers();
    setTurns((list) => [...list, { id: `${hit?.id ?? "free"}-${list.length}`, question: q, answer: text }]);
    setAnswer(text);
    setWord(-1);
    setDraft("");
    setPhase("thinking");

    timers.current.push(
      window.setTimeout(() => {
        setPhase("speaking");
        const total = wordStarts(text).length;
        // Timed subtitles: the fallback, and a backstop for voices that never send word boundaries.
        let w = -1;
        const step = window.setInterval(
          () => {
            if (performance.now() - lastBoundary.current < 900) return; // the voice is driving
            w = Math.min(total - 1, w + 1);
            setWord((cur) => Math.max(cur, w));
          },
          1000 / (wps * (voiceAllowed && !muted ? config.tts.rate : 1)),
        );
        timers.current.push(step);
        const spoken =
          voiceAllowed &&
          !muted &&
          speak(
            text,
            config.tts,
            (i) => {
              lastBoundary.current = performance.now();
              w = i;
              setWord(i);
            },
            () => {
              window.clearInterval(step);
              finish(count);
            },
          );
        if (!spoken) {
          // No voice: end when the subtitles reach the last word.
          timers.current.push(window.setTimeout(() => {
            window.clearInterval(step);
            finish(count);
          }, (total / wps) * 1000 + 300));
        }
      }, THINK_MS),
    );
  };

  // Lip flap while speaking.
  useEffect(() => {
    if (phase !== "speaking" || !live) return;
    const id = window.setInterval(() => setFlap((f) => !f), lipFlap);
    return () => window.clearInterval(id);
  }, [phase, live, lipFlap]);

  const restart = () => {
    clearTimers();
    cancelSpeech();
    setTurns([]);
    setAnswer("");
    setWord(-1);
    setPhase("waiting");
  };

  const toggleMute = () => {
    if (!muted) cancelSpeech();
    setMuted((m) => !m);
  };

  // Which sentence is being said → subtitle line + emphasis on every second sentence.
  const sents = useMemo(() => sentences(answer), [answer]);
  const starts = useMemo(() => wordStarts(answer), [answer]);
  const charAt = word >= 0 && word < starts.length ? starts[word] : word >= starts.length ? answer.length : -1;
  let sIndex = 0;
  for (let i = 0; i < sents.length; i++) if (sents[i].start <= Math.max(0, charAt)) sIndex = i;
  const sentence = sents[sIndex];
  const sentenceWords = sentence ? sentence.text.split(/\s+/) : [];
  // Global index of the sentence's first word → how many of its words have been said.
  const firstWord = sentence ? starts.filter((s) => s < sentence.start).length : 0;
  const shownWords = Math.min(sentenceWords.length, Math.max(0, word - firstWord + 1));

  const pose =
    phase === "thinking"
      ? pick(config.poses.pensive)
      : phase === "speaking"
        ? flap
          ? pick(sIndex % 2 ? config.poses.emphasis : config.poses.talking)
          : pick(config.poses.waiting)
        : phase === "done"
          ? pick(config.poses.thanks)
          : pick(config.poses.waiting);
  const stack = useMemo(
    () => [...new Set(Object.values(config.poses))].map(pick),
    [config.poses, pick],
  );

  const crt = live && config.crt;
  const left = Math.max(0, config.maxQuestions - turns.length);
  const unasked = config.questions.filter((q) => q.preset && !turns.some((x) => x.id.startsWith(`${q.id}-`)));
  const busy = phase === "thinking" || phase === "speaking";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  return (
    <div className={cn("grid items-center gap-8 lg:grid-cols-12 lg:gap-12", embedded && "lg:grid-cols-1")}>
      {/* The set */}
      <div className={cn("lg:col-span-7", embedded && "lg:col-span-1")}>
        <div className={cn("relative rounded-[2.2rem] border border-line bg-[#111] p-3 shadow-[0_40px_120px_rgb(0_0_0/0.6)] md:p-5", crt && "interview-tv")}>
          <div className={cn("relative aspect-[4/3] overflow-hidden rounded-[1.6rem] bg-[#06070a]", crt && "interview-crt")}>
            <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(60% 55% at 50% 45%, color-mix(in srgb, var(--accent) 10%, #0d1015) 0%, #050608 80%)" }} />
            {stack.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element -- stacked transparent stills toggled by opacity (lip flap)
              <img
                key={p.id}
                src={p.src}
                alt=""
                draggable={false}
                decoding="async"
                className="absolute inset-x-0 bottom-0 mx-auto h-[96%] w-auto max-w-none object-contain object-bottom"
                style={{ opacity: p.id === pose.id ? 1 : 0, transition: live ? "opacity 70ms linear" : undefined }}
              />
            ))}

            {/* Chrome: channel, on-air, lower third, subtitles */}
            <div className="absolute right-5 top-4 font-mono text-sm tracking-widest text-[#9cff9c] [text-shadow:0_0_8px_rgb(120_255_120/0.6)]" aria-hidden>
              CH {pad(config.channel)}
            </div>
            <div className="absolute left-5 top-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/80">
              <span className={cn("size-2 rounded-full", busy ? "bg-[#ff2d2d]" : "bg-white/30", busy && live && "animate-pulse")} />
              {t("hero.interview.live")}
            </div>
            <div className="absolute inset-x-5 bottom-5 flex flex-col items-center gap-3">
              {config.subtitles && phase === "speaking" && sentence && (
                <p aria-hidden className="max-w-[92%] bg-black/70 px-3 py-1.5 text-center text-sm leading-snug text-white md:text-lg">
                  {sentenceWords.slice(0, Math.max(1, shownWords)).join(" ")}
                </p>
              )}
              {phase === "done" && (
                <p className="type-display bg-black/60 px-4 py-2 text-center text-2xl text-white md:text-4xl">{config.outro}</p>
              )}
              <div className="flex w-full items-end justify-between gap-3">
                <span className="bg-accent px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-bg">{config.title}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/60">{brand.identity.name}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 px-2">
            {config.waveform ? <Waveform bars={num("interview.waveBars")} active={phase === "speaking"} animate={live} /> : <span />}
            {voiceAllowed && speechSupported() && (
              <button type="button" onClick={toggleMute} aria-pressed={muted} className="font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:text-fg">
                {muted ? t("hero.interview.unmute") : t("hero.interview.mute")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The desk */}
      <div className={cn("flex flex-col gap-5 lg:col-span-5", embedded && "lg:col-span-1")}>
        {!embedded && (
          <div>
            <h1 className="type-display text-[clamp(3rem,7vw,6.5rem)] leading-[0.86]">{brand.identity.name}</h1>
            <p className="mt-3 text-lg text-fg/75">{config.intro}</p>
          </div>
        )}

        <ol aria-live="polite" className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-1" data-lenis-prevent>
          {turns.map((turn, i) => (
            <li key={turn.id} className="flex flex-col gap-1">
              <p className="self-end bg-fg/10 px-3 py-2 text-sm">{turn.question}</p>
              <p className={cn("max-w-[95%] border-l-2 border-accent pl-3 text-sm leading-relaxed text-fg/80", i === turns.length - 1 && phase === "thinking" && "opacity-40")}>
                {i === turns.length - 1 && phase === "thinking" ? "…" : turn.answer}
              </p>
            </li>
          ))}
        </ol>

        {phase === "done" ? (
          <div className="flex flex-wrap items-center gap-6">
            <button type="button" onClick={restart} className="border border-fg px-6 py-3 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300 hover:bg-fg hover:text-bg">
              {t("hero.interview.again")}
            </button>
            {!embedded && <HeroCtas />}
          </div>
        ) : (
          <>
            <p className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted">
              <span>{t("hero.interview.prompt")}</span>
              <span>{t("hero.interview.left", { n: left })}</span>
            </p>
            <ul className="flex flex-wrap gap-2">
              {unasked.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => ask(q.question)}
                    className="border border-line px-3 py-2 text-left text-sm transition-colors duration-300 hover:border-accent hover:text-accent disabled:opacity-40"
                  >
                    {q.question}
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={submit} className="flex gap-2">
              <input
                value={draft}
                maxLength={200}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("hero.interview.placeholder")}
                aria-label={t("hero.interview.placeholder")}
                className="min-w-0 flex-1 border border-line bg-transparent px-3 py-2.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button type="submit" disabled={busy || !draft.trim()} className="bg-fg px-5 font-mono text-[11px] uppercase tracking-widest text-bg transition-opacity disabled:opacity-40">
                {t("hero.interview.send")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function InterviewHero() {
  const hero = useHeroConfig();
  const live = useMediaQuery(RICH_MOTION_QUERY);
  return (
    <section id="home" data-section="Hero" className="relative flex min-h-svh items-center py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: "radial-gradient(50% 45% at 30% 50%, color-mix(in srgb, var(--accent) 5%, transparent), transparent 70%)" }} />
      <div className={CONTAINER}>
        <InterviewSet hero={hero} config={hero.interview} live={live} />
      </div>
    </section>
  );
}
