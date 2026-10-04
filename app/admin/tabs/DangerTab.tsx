"use client";

import { useState } from "react";
import { btn, btnDanger, card, input, micro, Section, TabHeader } from "@/components/admin/ui";
import { DEFAULT_CINEMATIC, EFFECT_IDS } from "@/data/cinematic-defaults";
import type { CinematicEffects } from "@/data/site-config";
import { useConfigStore } from "../store";

type Props = { onBackupNow: () => Promise<void>; onOpenSettings: () => void; onSuccess: (m: string) => void };

type Action = {
  id: string;
  title: string;
  what: string;
  /** Typed word required before it runs (for the ones that can't be discarded). */
  confirmWord?: string;
  draft: boolean;
  run: () => void | Promise<void>;
};

/**
 * Big red buttons, kept in one place. Most of them only change the drafts
 * (Discard still undoes them); the ones that act immediately ask you to type
 * a word first.
 */
export default function DangerTab({ onBackupNow, onOpenSettings, onSuccess }: Props) {
  const { setSite, discard, dirty } = useConfigStore();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const actions: Action[] = [
    {
      id: "kill",
      title: "Kill every effect",
      what: "Switches all 18 cinematic effects and every experiment off. Their settings are kept for later.",
      draft: true,
      run: () =>
        setSite((s) => ({
          ...s,
          cinematic: {
            ...s.cinematic,
            effects: Object.fromEntries(EFFECT_IDS.map((id) => [id, { ...s.cinematic.effects[id], enabled: false }])) as unknown as CinematicEffects,
            experiments: DEFAULT_CINEMATIC.experiments,
          },
        })),
    },
    {
      id: "cinematic",
      title: "Factory-reset the cinematic toolbox",
      what: "Effects, scopes, section overrides, project grades, cursor, sound, motion, experiments and hero options all go back to their defaults.",
      draft: true,
      run: () => setSite((s) => ({ ...s, cinematic: DEFAULT_CINEMATIC })),
    },
    {
      id: "hero",
      title: "Back to the Cinematic hero",
      what: "Makes the original Cinematic hero the home page's opening again.",
      draft: true,
      run: () => setSite((s) => ({ ...s, heroVariant: "cinematic" })),
    },
    {
      id: "discard",
      title: "Discard every unsaved edit",
      what: "Throws away all drafts in every tab and reloads what's published.",
      draft: false,
      confirmWord: "discard",
      run: () => {
        discard();
        onSuccess("All drafts discarded");
      },
    },
    {
      id: "local",
      title: "Clear this browser's admin data",
      what: "Forgets the preview dock's size and page, hero-preview preference and similar. Doesn't touch the site or your key.",
      draft: false,
      confirmWord: "clear",
      run: () => {
        try {
          for (const k of Object.keys(localStorage)) if (k.startsWith("3skrino-admin")) localStorage.removeItem(k);
          onSuccess("Local admin data cleared");
        } catch {
          // storage blocked — nothing stored anyway
        }
      },
    },
  ];

  const draftCount = dirty.hero.length + dirty.site.length;

  return (
    <div>
      <TabHeader title="Danger Zone" hint="reset switches · draft actions can still be discarded; the others ask for a word first" />

      <Section title="Before anything drastic" hint="a snapshot of every data file, committed to backups/">
        <button
          type="button"
          className={btn}
          disabled={busy === "backup"}
          onClick={async () => {
            setBusy("backup");
            try {
              await onBackupNow();
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "backup" ? "Backing up…" : "Back up everything now"}
        </button>
      </Section>

      <Section title="Resets">
        <ul className="flex flex-col gap-2">
          {actions.map((a) => {
            const needs = a.confirmWord;
            const ready = !needs || typed[a.id]?.trim().toLowerCase() === needs;
            return (
              <li key={a.id} className={`${card} flex flex-wrap items-center gap-3 border-[#ff2d2d]/20 p-3`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-tight">{a.title}</p>
                  <p className="text-xs text-white/50">{a.what}</p>
                  <p className={`${micro} mt-1 text-[9px] ${a.draft ? "text-white/35" : "text-[#ff6b6b]/80"}`}>{a.draft ? "changes the draft — save to publish, discard to undo" : "acts immediately"}</p>
                </div>
                {needs && (
                  <input
                    value={typed[a.id] ?? ""}
                    onChange={(e) => setTyped((t) => ({ ...t, [a.id]: e.target.value }))}
                    placeholder={`type "${needs}"`}
                    className={`${input} w-36`}
                    aria-label={`Type ${needs} to confirm`}
                  />
                )}
                <button
                  type="button"
                  className={btnDanger}
                  disabled={!ready || (a.id === "discard" && !draftCount)}
                  onClick={() => {
                    void a.run();
                    setTyped((t) => ({ ...t, [a.id]: "" }));
                  }}
                >
                  {a.title.split(" ").slice(0, 2).join(" ")}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Elsewhere">
        <p className="text-sm text-white/60">
          Resetting the hero to factory settings and rotating the admin key live in{" "}
          <button type="button" onClick={onOpenSettings} className="text-[#e7fe55] underline-offset-4 hover:underline">
            Settings → Danger zone
          </button>
          . Restoring an older version of any file lives in Backups.
        </p>
      </Section>
    </div>
  );
}
