/**
 * Every editable string on the site: its key, where it lives (page →
 * section) and its default. admin → Text stores only overrides (data/brand.ts
 * → text); components read through useText() / <T> from lib/brand.ts.
 *
 * Headline format: " / " breaks a line, *word* sets it in the editorial
 * accent (italic + accent colour) — e.g. "Vertical / *Cuts.*".
 */

export type TextEntry = {
  key: string;
  page: string;
  section: string;
  label: string;
  default: string;
  /** Long copy → a textarea in the admin. */
  multiline?: boolean;
  /** Uses the headline format above. */
  headline?: boolean;
};

const e = (key: string, label: string, def: string, extra: Partial<TextEntry> = {}): TextEntry => {
  const [page, section] = key.split(".");
  return { key, page, section, label, default: def, ...extra };
};

export const TEXT_REGISTRY: readonly TextEntry[] = [
  // Hero — shared CTAs
  e("home.hero.kicker", "Kicker (Cinematic hero)", "Available for work — 2026"),
  e("home.hero.ctaWork", "Primary CTA", "View work"),
  e("home.hero.ctaReel", "Secondary CTA", "Showreel"),

  // Home sections
  e("home.vertical.label", "Bar label", "Vertical Cuts"),
  e("home.vertical.headline", "Headline", "Vertical / *Cuts.*", { headline: true }),
  e("home.vertical.meta", "Meta line ({n} = count)", "{n} projects — 9:16 · Reels / TikTok / Shorts"),
  e("home.vertical.more", "Link", "All vertical cuts"),
  e("home.horizontal.label", "Bar label", "Horizontal Cuts"),
  e("home.horizontal.headline", "Headline", "Horizontal / *Cuts.*", { headline: true }),
  e("home.horizontal.meta", "Meta line ({n} = count)", "{n} projects — 16:9 · Brand films / Launch spots"),
  e("home.horizontal.more", "Link", "All horizontal cuts"),
  e("home.fields.label", "Bar label", "Fields"),
  e("home.fields.headline", "Headline", "What I / *Cut.*", { headline: true }),
  e(
    "home.fields.blurb",
    "Blurb ({n} = count)",
    "{n} fields, one editorial eye. Mostly vertical, always built around rhythm, story and the platform it lives on.",
    { multiline: true },
  ),
  e("home.ai.label", "Bar label", "AI Cuts"),
  e("home.ai.headline", "Headline", "*AI* / Cuts.", { headline: true }),
  e(
    "home.ai.blurb",
    "Blurb",
    "Beyond traditional editing — I direct AI-generated sequences for brands that want to push visual language further. From concept to final cut, using the latest generative tools.",
    { multiline: true },
  ),
  e("home.contact.status", "Status line", "Available for new projects"),
  e("home.contact.headline", "Headline", "Let's / Create.", { headline: true }),

  // Footer
  e("global.footer.status", "Status line", "Available for work"),
  e("global.footer.cta", "CTA", "Let's create"),
  e("global.footer.place", "Place", "Cairo, EG"),
  e("global.footer.reach", "Reach", "Cairo → Worldwide"),

  // Confrontation hero
  e("hero.confrontation.kicker", "Kicker", "He sees you."),
  e("hero.confrontation.hint", "Hint", "Hold still. Click. Walk away. He notices."),
  e("hero.confrontation.scoff", "Scoff overlay", "hm."),
  e("hero.confrontation.comeBack", "Turn-away overlay", "come back"),
  e("hero.confrontation.srLabel", "Screen-reader description", "A backlit portrait of 3SKRINO that reacts to your pointer — he tracks you, smiles when you linger, and looks away when you leave."),

  // Interview hero
  e("hero.interview.prompt", "Prompt", "Ask me anything"),
  e("hero.interview.placeholder", "Input placeholder", "Type a question…"),
  e("hero.interview.send", "Send button", "Ask"),
  e("hero.interview.live", "On-air badge", "On air"),
  e("hero.interview.again", "Restart button", "Watch again"),
  e("hero.interview.mute", "Mute button", "Mute voice"),
  e("hero.interview.unmute", "Unmute button", "Voice on"),
  e("hero.interview.left", "Questions left ({n})", "{n} questions left"),
];

export const TEXT_BY_KEY: ReadonlyMap<string, TextEntry> = new Map(TEXT_REGISTRY.map((t) => [t.key, t]));
