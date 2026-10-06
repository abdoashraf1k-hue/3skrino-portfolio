"use client";

import { useEffect, useMemo, useState } from "react";
import { NumberField, PoseSelect, slugify, uniqueId } from "@/components/admin/fields";
import ReorderList from "@/components/admin/ReorderList";
import { btn, card, Field, input, micro, Section, Slider, TabHeader, Toggle } from "@/components/admin/ui";
import { InterviewSet } from "@/components/heroes/InterviewHero";
import { poseMap } from "@/components/heroes/shared";
import type { InterviewConfig, InterviewQuestion } from "@/data/hero-config";
import { DEFAULT_INTERVIEW } from "@/data/hero-defaults";
import { cancelSpeech, loadVoices, matchQuestion, speak, speechSupported } from "@/lib/interview";
import { useConfigStore } from "../store";

const POSE_SLOTS: { key: keyof InterviewConfig["poses"]; label: string }[] = [
  { key: "waiting", label: "Waiting (mouth closed)" },
  { key: "talking", label: "Talking (lip-flap)" },
  { key: "emphasis", label: "Emphasis (every 2nd sentence)" },
  { key: "pensive", label: "Thinking" },
  { key: "thanks", label: "Thank you" },
];

/** admin → Interview: the script, the voice and the set of Hero B. */
export default function InterviewTab() {
  const { hero, setHero } = useConfigStore();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [probe, setProbe] = useState("");
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadVoices().then((v) => alive && setVoices(v));
    return () => {
      alive = false;
      cancelSpeech();
    };
  }, []);

  const allPoses = useMemo(() => (hero ? [...poseMap(hero).values()] : []), [hero]);
  if (!hero) return null;
  const iv = hero.interview;
  const set = (patch: Partial<InterviewConfig>) => setHero((c) => ({ ...c, interview: { ...c.interview, ...patch } }));
  const setQ = (id: string, patch: Partial<InterviewQuestion>) => set({ questions: iv.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  const addQ = () => {
    const id = uniqueId("question", new Set(iv.questions.map((q) => q.id)));
    set({ questions: [...iv.questions, { id, question: "New question?", answer: "Two or three sentences, in your voice.", keywords: [], preset: true }] });
  };
  const routed = probe.trim() ? matchQuestion(probe, iv.questions) : null;

  return (
    <div>
      <TabHeader
        title="Interview"
        hint="Hero B — pick it in Heroes · questions, answers, the voice and the TV · the inline preview is fully playable"
        actions={
          <button type="button" className={btn} onClick={() => set(DEFAULT_INTERVIEW)}>
            Reset interview
          </button>
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <div className="min-w-0">
          <Section title={`Questions (${iv.questions.length})`} hint="presets show as one-click chips · keywords route typed questions · drag ⋮⋮ to reorder" aside={<button type="button" className={`${btn} border-[#e7fe55]/40 text-[#e7fe55]`} onClick={addQ}>+ Question</button>}>
            <ReorderList
              label="Questions"
              handle
              items={iv.questions}
              getId={(q) => q.id}
              onChange={(questions) => set({ questions })}
              className="flex flex-col gap-2"
              render={(q, i, move) => (
                <div className={`${card} p-3`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span data-drag-handle className="cursor-grab select-none px-1 text-white/30 active:cursor-grabbing" aria-hidden>
                      ⋮⋮
                    </span>
                    <input aria-label={`Question ${i + 1}`} className={`${input} font-semibold`} value={q.question} maxLength={140} onChange={(e) => setQ(q.id, { question: e.target.value })} />
                    <button type="button" className={btn} aria-label="Move up" disabled={i === 0} onClick={() => move(-1)}>
                      ↑
                    </button>
                    <button type="button" className={btn} aria-label="Move down" disabled={i === iv.questions.length - 1} onClick={() => move(1)}>
                      ↓
                    </button>
                    <button type="button" className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff6b6b]`} onClick={() => set({ questions: iv.questions.filter((x) => x.id !== q.id) })}>
                      ✕
                    </button>
                  </div>
                  <Field label="Answer" counter={[q.answer.length, 1200]}>
                    <textarea rows={3} className={input} value={q.answer} maxLength={1200} onChange={(e) => setQ(q.id, { answer: e.target.value })} />
                  </Field>
                  <div className="mt-2 grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Field label="Keywords (comma-separated)">
                      <input
                        className={`${input} font-mono text-xs`}
                        defaultValue={q.keywords.join(", ")}
                        key={q.keywords.join(",")}
                        onBlur={(e) => setQ(q.id, { keywords: [...new Set(e.target.value.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean))] })}
                      />
                    </Field>
                    <label className={`${micro} flex items-center gap-2 pb-2 text-white/60`}>
                      <input type="checkbox" checked={q.preset} onChange={(e) => setQ(q.id, { preset: e.target.checked })} className="accent-[#e7fe55]" />
                      Preset chip
                    </label>
                  </div>
                  <p className={`${micro} mt-1 text-[9px] text-white/25`}>
                    id {q.id}
                    <button type="button" className="ml-2 hover:text-white" onClick={() => setQ(q.id, { id: uniqueId(slugify(q.question, "question"), new Set(iv.questions.filter((x) => x !== q).map((x) => x.id))) })}>
                      ↻ from question
                    </button>
                  </p>
                </div>
              )}
            />
            <div className={`${card} mt-4 p-3`}>
              <Field label="Routing tester — type what a visitor might ask">
                <input className={input} value={probe} placeholder="how much do you charge?" onChange={(e) => setProbe(e.target.value)} />
              </Field>
              {probe.trim() && (
                <p className="mt-2 text-sm text-white/70">
                  → {routed ? <strong className="text-[#e7fe55]">{routed.question}</strong> : <span className="text-[#ffb54d]">fallback answer</span>}
                </p>
              )}
            </div>
          </Section>

          <Section title="Show">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Show title (lower third)">
                <input className={input} value={iv.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <NumberField label="Channel" min={1} max={99} value={iv.channel} onChange={(channel) => set({ channel })} />
              <div className="md:col-span-2">
                <Field label="Intro">
                  <textarea rows={2} className={input} value={iv.intro} maxLength={300} onChange={(e) => set({ intro: e.target.value })} />
                </Field>
              </div>
              <Field label="Outro (“Thank you for watching”)">
                <textarea rows={2} className={input} value={iv.outro} maxLength={300} onChange={(e) => set({ outro: e.target.value })} />
              </Field>
              <Field label="Fallback answer (nothing matched)">
                <textarea rows={2} className={input} value={iv.fallback} maxLength={600} onChange={(e) => set({ fallback: e.target.value })} />
              </Field>
              <NumberField label="Answers before the outro" min={1} max={12} value={iv.maxQuestions} onChange={(maxQuestions) => set({ maxQuestions })} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Toggle label="CRT screen" hint="scanlines, roll, glare" checked={iv.crt} onChange={(crt) => set({ crt })} />
              <Toggle label="Subtitles" checked={iv.subtitles} onChange={(subtitles) => set({ subtitles })} />
              <Toggle label="Waveform" checked={iv.waveform} onChange={(waveform) => set({ waveform })} />
            </div>
          </Section>

          <Section title="Voice" hint={speechSupported() ? `${voices.length} voices in this browser — visitors hear their own browser's voice of that name, else its default` : "this browser has no speech synthesis"}>
            <div className="grid gap-2 md:grid-cols-2">
              <Toggle label="Read answers aloud" hint="desktop only; phones and reduced motion stay text-only" checked={iv.tts.enabled} onChange={(enabled) => set({ tts: { ...iv.tts, enabled } })} />
              <label className={`${card} block px-3 py-2.5`}>
                <span className="text-sm">Voice</span>
                <select className={`${input} mt-1`} value={iv.tts.voice} onChange={(e) => set({ tts: { ...iv.tts, voice: e.target.value } })}>
                  <option value="">Browser default</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} — {v.lang}
                    </option>
                  ))}
                </select>
              </label>
              <Slider label="Speed" min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}×`} value={iv.tts.rate} onChange={(rate) => set({ tts: { ...iv.tts, rate } })} />
              <Slider label="Pitch" min={0} max={2} step={0.05} value={iv.tts.pitch} onChange={(pitch) => set({ tts: { ...iv.tts, pitch } })} />
              <Slider label="Volume" min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} value={iv.tts.volume} onChange={(volume) => set({ tts: { ...iv.tts, volume } })} />
              <div className={`${card} flex items-center gap-2 px-3 py-2.5`}>
                <button type="button" className={btn} disabled={!speechSupported()} onClick={() => speak(iv.questions[0]?.answer ?? iv.intro, iv.tts, () => {}, () => {})}>
                  ▶ Test voice
                </button>
                <button type="button" className={btn} onClick={cancelSpeech}>
                  ■ Stop
                </button>
              </div>
            </div>
          </Section>

          <Section title="Poses" hint="any pose — ladder, up / down or an expression from Poses">
            <div className="grid gap-2 md:grid-cols-2">
              {POSE_SLOTS.map((slot) => (
                <PoseSelect key={slot.key} label={slot.label} value={iv.poses[slot.key]} poses={allPoses} onChange={(id) => set({ poses: { ...iv.poses, [slot.key]: id } })} />
              ))}
            </div>
          </Section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <Section title="On air" hint="playable — uses the draft" aside={<button type="button" className={btn} onClick={() => setPreviewKey((k) => k + 1)}>↺ Restart</button>}>
            <div className="border border-white/10 bg-[#0a0a0a] p-4">
              <InterviewSet key={previewKey} hero={hero} config={iv} live embedded />
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
