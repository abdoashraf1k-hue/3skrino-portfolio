"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { btn, btnPrimary, card, micro, Section, Slider, TabHeader, Toggle } from "@/components/admin/ui";
import { DEFAULT_CINEMATIC, SOUND_NAMES } from "@/data/cinematic-defaults";
import type { SoundName, SoundSlot } from "@/data/site-config";
import { assertSoundFile, uploadHeroAsset } from "@/lib/admin/hero-assets";
import { playUiSound } from "@/lib/ui-sound";
import { useConfigStore } from "../store";

const ABOUT: Record<SoundName, { label: string; when: string }> = {
  hover: { label: "Hover", when: "pointer enters a link or button" },
  click: { label: "Click", when: "a link or button is pressed" },
  transition: { label: "Transition", when: "moving to another page" },
  notification: { label: "Notification", when: "the command palette opens" },
  error: { label: "Error", when: "the contact form fails" },
  success: { label: "Success", when: "the contact form sends" },
};

type Props = { adminKey: string; onError: (m: string) => void; onSuccess: (m: string) => void };

export default function SoundTab({ adminKey, onError, onSuccess }: Props) {
  const { site, setSite } = useConfigStore();
  const [busy, setBusy] = useState<SoundName | null>(null);
  const fileRefs = useRef<Partial<Record<SoundName, HTMLInputElement | null>>>({});
  if (!site) return null;
  const sound = site.cinematic.sound;
  const setSound = (patch: Partial<typeof sound>) => setSite((s) => ({ ...s, cinematic: { ...s.cinematic, sound: { ...s.cinematic.sound, ...patch } } }));
  const setSlot = (name: SoundName, patch: Partial<SoundSlot>) =>
    setSite((s) => ({
      ...s,
      cinematic: {
        ...s.cinematic,
        sound: { ...s.cinematic.sound, sounds: { ...s.cinematic.sound.sounds, [name]: { ...s.cinematic.sound.sounds[name], ...patch } } },
      },
    }));

  // Tests ignore the on/off switches — you hear exactly what the slot would play.
  const test = (name: SoundName) => playUiSound(name, { ...sound.sounds[name], enabled: true }, sound.volume);
  const testAll = () => SOUND_NAMES.forEach((n, i) => window.setTimeout(() => test(n), i * 420));

  const upload = async (name: SoundName, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      assertSoundFile(file);
      setBusy(name);
      const url = await uploadHeroAsset(file, "audio", `${name}-${file.name}`, adminKey);
      setSlot(name, { src: url });
      onSuccess(`${ABOUT[name].label} sound uploaded — save to publish`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <TabHeader
        title="Sound Studio"
        hint="UI sounds for the site · synthesised by default (nothing to download), or your own mp3 / wav"
        actions={
          <button type="button" className={btnPrimary} onClick={testAll}>
            ▶ Play all
          </button>
        }
      />

      <Section
        title="Master"
        onReset={() => setSound({ enabled: DEFAULT_CINEMATIC.sound.enabled, volume: DEFAULT_CINEMATIC.sound.volume })}
        help="Browsers only play sound after a visitor's first click or key press, so nothing plays on arrival. A visitor who switches sound off in the command palette (Ctrl/⌘ K → Sound) never hears it; one who never chose follows this switch."
      >
        <div className="grid gap-2 md:grid-cols-2">
          <Toggle label="UI sounds on the site" checked={sound.enabled} onChange={(enabled) => setSound({ enabled })} hint="visitors can still mute them" />
          <Slider label="Master volume" value={sound.volume} min={0} max={100} step={1} format={(v) => `${v}`} onChange={(volume) => setSound({ volume })} />
        </div>
      </Section>

      <Section
        title="Sounds"
        hint="each one: on / off, its own volume, a test button, an optional file"
        onReset={() => setSound({ sounds: DEFAULT_CINEMATIC.sound.sounds })}
      >
        <ul className="flex flex-col gap-2">
          {SOUND_NAMES.map((name) => {
            const slot = sound.sounds[name];
            const file = slot.src ? decodeURIComponent(slot.src.split("/").pop() ?? slot.src) : "";
            return (
              <li key={name} className={`${card} grid items-center gap-3 p-3 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1.2fr)_auto] ${slot.enabled ? "" : "opacity-60"}`}>
                <div>
                  <p className="text-sm font-bold uppercase tracking-tight">{ABOUT[name].label}</p>
                  <p className={`${micro} text-[9px] text-white/35`}>{ABOUT[name].when}</p>
                </div>
                <Toggle label={slot.enabled ? "On" : "Off"} checked={slot.enabled} onChange={(enabled) => setSlot(name, { enabled })} />
                <Slider label="Volume" value={slot.volume} min={0} max={100} step={1} format={(v) => `${v}`} onChange={(volume) => setSlot(name, { volume })} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={btn} onClick={() => test(name)} aria-label={`Test ${ABOUT[name].label}`}>
                    ▶ Test
                  </button>
                  <input
                    ref={(el) => {
                      fileRefs.current[name] = el;
                    }}
                    type="file"
                    accept="audio/mpeg,audio/wav,.mp3,.wav"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(e) => void upload(name, e)}
                  />
                  <button type="button" className={btn} disabled={busy !== null} onClick={() => fileRefs.current[name]?.click()}>
                    {busy === name ? "Uploading…" : slot.src ? "Replace file" : "Upload file"}
                  </button>
                  {slot.src && (
                    <button type="button" className={btn} onClick={() => setSlot(name, { src: "" })} title={file}>
                      Use synth
                    </button>
                  )}
                </div>
                <p className={`${micro} text-[9px] text-white/30 md:col-span-4`}>Source: {slot.src ? file : "synthesised"}</p>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
