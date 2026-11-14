"use server";

import { generateText, jsonSchema, Output } from "ai";
import type { GenesisBackground } from "@/data/hero-config";
import { GENESIS_BACKGROUNDS } from "@/data/hero-defaults";
import { isValidAdminKey } from "@/lib/admin/auth";
import { mapThemePrompt, sanitizePalette, type ThemeResult } from "@/lib/genesis-theme";

/**
 * Sprint 15 — AI Theme Prompt (admin → Poses → Genesis). A Server Action:
 * "Vaporwave" / "Matrix Green" / any mood → five hex colours for the Genesis
 * hero (grid, glow, shader tint, accent, stage) plus a fitting backdrop.
 *
 * With the AI Gateway configured (AI_GATEWAY_API_KEY or Vercel OIDC) an LLM
 * picks the palette; otherwise — or if that call fails — the deterministic
 * mapper in lib/genesis-theme does. Server Functions are reachable by direct
 * POST, so the admin key is checked here, not just in the UI.
 */

const MODEL = "openai/gpt-4o-mini";

const schema = jsonSchema<{ name: string; background: string; grid: string; glow: string; tint: string; accent: string; preset: string }>({
  type: "object",
  additionalProperties: false,
  required: ["name", "background", "grid", "glow", "tint", "accent", "preset"],
  properties: {
    name: { type: "string", description: "2-3 word name for the theme" },
    background: { type: "string", description: "#rrggbb, near-black stage colour (lightness under 6%)" },
    grid: { type: "string", description: "#rrggbb, bright neon colour for retro grid lines" },
    glow: { type: "string", description: "#rrggbb, rim glow around the head and the logo's neon" },
    tint: { type: "string", description: "#rrggbb, main colour of the animated background shader" },
    accent: { type: "string", description: "#rrggbb, secondary shader colour and horizon haze" },
    preset: { type: "string", enum: [...GENESIS_BACKGROUNDS] },
  },
});

export type ThemeActionResult = { ok: true; theme: ThemeResult; note?: string } | { ok: false; error: string };

export async function generateHeroTheme(adminKey: string, prompt: string): Promise<ThemeActionResult> {
  if (!isValidAdminKey(adminKey)) return { ok: false, error: "Unauthorized" };
  const text = String(prompt ?? "").trim().slice(0, 120);
  if (!text) return { ok: false, error: "Type a mood first — e.g. “Vaporwave” or “Matrix Green”" };

  const fallback = mapThemePrompt(text);
  if (!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)) {
    return { ok: true, theme: fallback, note: "AI Gateway not configured — matched with the built-in palette engine" };
  }

  try {
    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema }),
      system:
        "You are a colourist designing a dark, cinematic, neon hero for a video editor's portfolio. Given a mood, return a palette. " +
        "The stage must be near-black; grid, glow and accent must be saturated and bright enough to glow on it. " +
        "Pick the background preset that best matches: celestial-nebula (cosmic noise), neon-ring-field (rotating neon rings), " +
        "liquid-metal (chrome liquid), calm-dark (minimal breathing gradient).",
      prompt: `Mood: ${text}`,
    });
    const raw = output as Record<string, unknown>;
    const background = (GENESIS_BACKGROUNDS as readonly string[]).includes(String(raw.preset)) ? (raw.preset as GenesisBackground) : fallback.background;
    return {
      ok: true,
      theme: {
        palette: sanitizePalette(raw, fallback.palette),
        background,
        source: "ai",
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : fallback.name,
      },
    };
  } catch {
    return { ok: true, theme: fallback, note: "AI request failed — matched with the built-in palette engine" };
  }
}
