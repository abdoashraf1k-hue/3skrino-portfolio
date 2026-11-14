import type { GenesisBackground, GenesisPalette } from "@/data/hero-config";

/**
 * Sprint 15 — AI Theme Prompt, deterministic half. Maps free text ("Vaporwave",
 * "Matrix Green", "blood moon over Tokyo") to a Genesis palette without any
 * network call. The server action tries an LLM first (when the AI Gateway is
 * configured) and falls back to this; both results go through `sanitizePalette`.
 *
 * Pure and isomorphic: no server-only imports.
 */

export type ThemeResult = {
  palette: GenesisPalette;
  /** A background preset that suits the mood, when the prompt implies one. */
  background?: GenesisBackground;
  /** Which engine produced it. */
  source: "ai" | "preset" | "generated";
  /** Display name of the matched preset / mood. */
  name: string;
};

type Preset = { name: string; keys: string[]; palette: GenesisPalette; background?: GenesisBackground };

const PRESETS: Preset[] = [
  {
    name: "Vaporwave",
    keys: ["vaporwave", "vapor", "aesthetic", "miami", "outrun", "synthwave", "retrowave", "80s", "eighties"],
    palette: { background: "#0d0221", grid: "#ff71ce", glow: "#01cdfe", tint: "#b967ff", accent: "#fffb96" },
    background: "neon-ring-field",
  },
  {
    name: "Matrix Green",
    keys: ["matrix", "hacker", "terminal", "code", "green", "digital rain"],
    palette: { background: "#010a03", grid: "#00ff41", glow: "#00ff41", tint: "#008f11", accent: "#a8ffb0" },
    background: "celestial-nebula",
  },
  {
    name: "Cyberpunk",
    keys: ["cyberpunk", "cyber", "night city", "neon", "tokyo", "blade runner", "dystopia"],
    palette: { background: "#07020f", grid: "#fcee0a", glow: "#ff003c", tint: "#00f0ff", accent: "#ff2bd6" },
    background: "neon-ring-field",
  },
  {
    name: "Blood Moon",
    keys: ["blood", "crimson", "vampire", "horror", "red", "moon", "hell", "inferno"],
    palette: { background: "#0a0102", grid: "#ff2d2d", glow: "#ff4d1a", tint: "#7a0010", accent: "#ffb199" },
    background: "celestial-nebula",
  },
  {
    name: "Ice / Arctic",
    keys: ["ice", "arctic", "frost", "frozen", "glacier", "winter", "snow", "cold"],
    palette: { background: "#020812", grid: "#9fe7ff", glow: "#e6fbff", tint: "#1f6bff", accent: "#8b5cff" },
    background: "liquid-metal",
  },
  {
    name: "Gold / Luxury",
    keys: ["gold", "luxury", "royal", "premium", "champagne", "rich", "opulent"],
    palette: { background: "#0b0805", grid: "#ffd166", glow: "#ffb347", tint: "#8a5a00", accent: "#fff1c1" },
    background: "liquid-metal",
  },
  {
    name: "Chrome / Mono",
    keys: ["chrome", "mono", "monochrome", "black and white", "silver", "steel", "noir", "minimal"],
    palette: { background: "#060606", grid: "#f2f2f2", glow: "#ffffff", tint: "#7d8590", accent: "#c9d1d9" },
    background: "liquid-metal",
  },
  {
    name: "Deep Ocean",
    keys: ["ocean", "sea", "deep", "underwater", "abyss", "aqua", "marine"],
    palette: { background: "#010814", grid: "#3de0ff", glow: "#5cffc8", tint: "#0b3d91", accent: "#1f6bff" },
    background: "celestial-nebula",
  },
  {
    name: "Sunset",
    keys: ["sunset", "dusk", "sunrise", "golden hour", "orange", "warm", "desert"],
    palette: { background: "#0d0508", grid: "#ff7a1a", glow: "#ff3d6e", tint: "#7b2cbf", accent: "#ffd166" },
    background: "neon-ring-field",
  },
  {
    name: "Toxic",
    keys: ["toxic", "acid", "radioactive", "slime", "venom", "lime"],
    palette: { background: "#040802", grid: "#c6ff00", glow: "#76ff03", tint: "#33691e", accent: "#eeff41" },
    background: "celestial-nebula",
  },
  {
    name: "Calm Dark",
    keys: ["calm", "dark", "elegant", "minimalist", "quiet", "subtle", "zen", "night"],
    palette: { background: "#050507", grid: "#6b6b7a", glow: "#d8d8e0", tint: "#2a2a3a", accent: "#8a8aa0" },
    background: "calm-dark",
  },
  {
    name: "Galaxy",
    keys: ["galaxy", "space", "cosmic", "nebula", "stars", "universe", "celestial", "astral"],
    palette: { background: "#03020a", grid: "#b388ff", glow: "#ff6bd6", tint: "#3d1a8f", accent: "#00e5ff" },
    background: "celestial-nebula",
  },
];

/** Colour words → hue (degrees), for prompts no preset matches. */
const HUES: [string, number][] = [
  ["red", 0], ["scarlet", 355], ["crimson", 348], ["rose", 340], ["pink", 325], ["magenta", 300],
  ["purple", 275], ["violet", 265], ["indigo", 245], ["blue", 220], ["azure", 205], ["cyan", 185],
  ["teal", 175], ["mint", 155], ["green", 125], ["emerald", 140], ["lime", 85], ["yellow", 55],
  ["amber", 42], ["gold", 45], ["orange", 28], ["copper", 22], ["brown", 25],
];

const HEX = /^#[0-9a-f]{6}$/;

function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** FNV-1a: the same prompt always gives the same palette. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A neon palette around a base hue: split-complementary shader colours, a near-black stage. */
function generated(prompt: string): GenesisPalette {
  const words = prompt.toLowerCase();
  const named = HUES.filter(([w]) => words.includes(w)).map(([, h]) => h);
  const seed = hash(words);
  const base = named[0] ?? seed % 360;
  const second = named[1] ?? (base + 150 + (seed % 60)) % 360;
  return {
    background: hsl(base, 0.45, 0.03),
    grid: hsl(base, 1, 0.62),
    glow: hsl(second, 1, 0.6),
    tint: hsl((base + 210) % 360, 0.9, 0.42),
    accent: hsl((second + 40) % 360, 1, 0.66),
  };
}

/** Prompt → palette, no network. Presets win on a keyword match; anything else is generated from the words. */
export function mapThemePrompt(prompt: string): ThemeResult {
  const text = prompt.toLowerCase().trim();
  let best: Preset | null = null;
  let score = 0;
  for (const p of PRESETS) {
    const s = p.keys.reduce((n, k) => n + (text.includes(k) ? k.length : 0), 0);
    if (s > score) {
      score = s;
      best = p;
    }
  }
  if (best) return { palette: { ...best.palette }, background: best.background, source: "preset", name: best.name };
  return { palette: generated(text || "genesis"), source: "generated", name: prompt.trim().slice(0, 40) || "Generated" };
}

/** Keeps only valid #rrggbb colours, filling gaps from `fallback`. */
export function sanitizePalette(raw: Partial<Record<keyof GenesisPalette, unknown>>, fallback: GenesisPalette): GenesisPalette {
  const pick = (k: keyof GenesisPalette) => {
    const v = typeof raw[k] === "string" ? (raw[k] as string).trim().toLowerCase() : "";
    return HEX.test(v) ? v : fallback[k];
  };
  return { background: pick("background"), grid: pick("grid"), glow: pick("glow"), tint: pick("tint"), accent: pick("accent") };
}
