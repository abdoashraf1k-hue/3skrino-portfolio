"use client";

import { btn, card, Empty, input, micro, Section, TabHeader } from "@/components/admin/ui";
import { siteConfig as committed } from "@/data/site-config";
import { useConfigStore } from "../store";

const LINK = /^(https?:\/\/|mailto:)\S+$/;
const MAX = 12;

/** Social links: the footer, contact page and menu all read this list, in this order. */
export default function SocialTab() {
  const { site, setSite } = useConfigStore();
  if (!site) return null;
  const socials = site.content.socials;
  const setList = (next: typeof socials) => setSite((c) => ({ ...c, content: { ...c.content, socials: next } }));
  const update = (i: number, patch: Partial<(typeof socials)[number]>) => setList(socials.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= socials.length) return;
    const next = [...socials];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  return (
    <div>
      <TabHeader title="Social" hint={`${socials.length} of ${MAX} links · footer, contact page and menu, in this order`} />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Section
          title="Links"
          onReset={() => setList(committed.content.socials)}
          help="Each link needs a label and an http(s):// or mailto: address. Reset goes back to what's currently published."
          aside={
            <button type="button" className={btn} disabled={socials.length >= MAX} onClick={() => setList([...socials, { label: "", href: "https://" }])}>
              + Add link
            </button>
          }
        >
          {!socials.length && <Empty>No social links — add one</Empty>}
          <ul className="flex flex-col gap-2">
            {socials.map((s, i) => {
              const bad = !LINK.test(s.href);
              return (
                <li key={i} className={`${card} grid items-center gap-2 p-2 md:grid-cols-[auto_160px_minmax(0,1fr)_auto]`}>
                  <span className="flex gap-1">
                    <button type="button" className={`${btn} h-7 px-2`} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" className={`${btn} h-7 px-2`} disabled={i === socials.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      ↓
                    </button>
                  </span>
                  <input value={s.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" maxLength={30} className={input} aria-label="Label" />
                  <input
                    value={s.href}
                    onChange={(e) => update(i, { href: e.target.value.trim() })}
                    placeholder="https://…"
                    spellCheck={false}
                    className={`${input} font-mono text-xs ${bad ? "border-[#ff2d2d]/60" : ""}`}
                    aria-label="Address"
                    aria-invalid={bad}
                  />
                  <button type="button" className={`${btn} h-7 px-2`} onClick={() => setList(socials.filter((_, j) => j !== i))} aria-label={`Remove ${s.label || "link"}`}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Preview" hint="as the footer sets them">
          <div className="border border-white/10 bg-[#0a0a0a] p-6">
            <p className={`${micro} mb-4 text-white/35`}>Elsewhere</p>
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {socials.map((s, i) => (
                <li key={i} className={`font-mono text-[11px] uppercase tracking-widest ${LINK.test(s.href) && s.label ? "text-white/80" : "text-[#ff6b6b]"}`}>
                  {s.label || "Untitled"} ↗
                </li>
              ))}
            </ul>
          </div>
        </Section>
      </div>
    </div>
  );
}
