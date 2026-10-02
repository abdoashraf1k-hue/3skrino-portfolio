import { generateText, jsonSchema, Output } from "ai";
import { categories } from "@/data/categories";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { errorResponse, readJson } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "openai/gpt-4o-mini";
const CATEGORY_IDS = categories.map((c) => c.id);
const HEX = /^#[0-9a-f]{6}$/i;

export type Suggestion = {
  category: string;
  tags: string[];
  accentColor: string;
  filmed: boolean;
  directed: boolean;
  edited: boolean;
};

export type AnalyzeResponse = { ok: true; source: "ai" | "heuristic"; note?: string; suggestion: Suggestion };

type Input = { title: string; description: string; client: string; role: string; tools: string[] };

/* ------------------------------------------------------------------ */
/* Heuristic fallback — no network, no credits                          */
/* ------------------------------------------------------------------ */

const CATEGORY_WORDS: Record<string, string[]> = {
  sports: ["sport", "run", "match", "athlete", "gym", "football", "training", "race", "fitness"],
  corporate: ["corporate", "company", "brand film", "documentary", "interview", "logistics", "business", "ceo"],
  restaurants: ["food", "restaurant", "kitchen", "chef", "sushi", "coffee", "menu", "dish", "burger"],
  fashion: ["fashion", "lookbook", "collection", "apparel", "garment", "runway", "capsule", "wear"],
  automotive: ["car", "suv", "drive", "motor", "automotive", "vehicle", "road", "engine"],
  "real-estate": ["property", "tower", "residence", "apartment", "villa", "real estate", "interior", "home"],
  tours: ["tour", "travel", "trip", "destination", "desert", "safari", "hotel", "resort", "beach", "nile", "journey"],
  lifestyle: ["lifestyle", "morning", "ritual", "wellness", "daily", "routine"],
  reels: ["reel", "tiktok", "shorts", "vertical", "social"],
  ai: ["ai", "generated", "sora", "runway", "kling", "midjourney", "synthetic"],
};

const MOOD_COLORS: [string[], string][] = [
  [["night", "neon", "festival", "electric"], "#ff4fd8"],
  [["fire", "heat", "sizzle", "desert", "sunset", "golden"], "#ff8a3d"],
  [["ocean", "sea", "water", "cool", "ice"], "#5ad1c1"],
  [["luxury", "calm", "quiet", "minimal", "soft"], "#d8c3a5"],
  [["ai", "dream", "synthetic", "future"], "#9b8cff"],
  [["corporate", "tech", "clean"], "#7aa7ff"],
];

const STOP = new Set(
  "the a an and or of for to in on with by at from into is are was be this that it its as our your my we you they film video campaign project cut edit".split(" "),
);

function heuristic({ title, description, role, tools }: Input): Suggestion {
  const text = `${title} ${description}`.toLowerCase();
  const roleText = role.toLowerCase();

  let category = "lifestyle";
  let best = 0;
  for (const [id, words] of Object.entries(CATEGORY_WORDS)) {
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    if (score > best) {
      best = score;
      category = id;
    }
  }
  const aiTools = tools.some((t) => /sora|runway|kling|midjourney/i.test(t));
  if (aiTools && best < 2) category = "ai";

  const counts = new Map<string, number>();
  for (const word of text.match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (!STOP.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  const accentColor = MOOD_COLORS.find(([words]) => words.some((w) => text.includes(w)))?.[1] ?? "#e7fe55";
  const generated = category === "ai" || /generated|ai-generated/.test(text);

  return {
    category,
    tags: tags.length >= 3 ? tags : [...new Set([...tags, category, "video"])].slice(0, 5),
    accentColor,
    filmed: !generated && !/animation|motion graphics/.test(text),
    directed: /direct/.test(roleText) || /directed/.test(text),
    edited: /edit/.test(roleText) || roleText === "",
  };
}

/* ------------------------------------------------------------------ */
/* AI (Vercel AI Gateway)                                               */
/* ------------------------------------------------------------------ */

const schema = jsonSchema<Suggestion>({
  type: "object",
  additionalProperties: false,
  required: ["category", "tags", "accentColor", "filmed", "directed", "edited"],
  properties: {
    category: { type: "string", enum: CATEGORY_IDS },
    tags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    accentColor: { type: "string", description: "A 6-digit hex colour (#rrggbb) matching the video's mood" },
    filmed: { type: "boolean" },
    directed: { type: "boolean" },
    edited: { type: "boolean" },
  },
});

function sanitize(raw: Suggestion, fallback: Suggestion): Suggestion {
  return {
    category: CATEGORY_IDS.includes(raw.category) ? raw.category : fallback.category,
    tags: Array.isArray(raw.tags)
      ? [...new Set(raw.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 5)
      : fallback.tags,
    accentColor: HEX.test(raw.accentColor) ? raw.accentColor.toLowerCase() : fallback.accentColor,
    filmed: typeof raw.filmed === "boolean" ? raw.filmed : fallback.filmed,
    directed: typeof raw.directed === "boolean" ? raw.directed : fallback.directed,
    edited: typeof raw.edited === "boolean" ? raw.edited : fallback.edited,
  };
}

function gatewayConfigured(): boolean {
  return Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);
}

/** POST { title, description, client?, role?, tools? } → suggestion (AI when configured, heuristic otherwise). */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = await readJson(request);
    const input: Input = {
      title: String(body.title ?? "").slice(0, 200),
      description: String(body.description ?? "").slice(0, 2000),
      client: String(body.client ?? "").slice(0, 200),
      role: String(body.role ?? "").slice(0, 200),
      tools: Array.isArray(body.tools) ? body.tools.map(String).slice(0, 20) : [],
    };
    const fallback = heuristic(input);

    if (!gatewayConfigured()) {
      const res: AnalyzeResponse = {
        ok: true,
        source: "heuristic",
        note: "AI not configured (no VERCEL_OIDC_TOKEN / AI_GATEWAY_API_KEY) — keyword-based suggestions",
        suggestion: fallback,
      };
      return Response.json(res);
    }

    try {
      const { output } = await generateText({
        model: MODEL,
        output: Output.object({ schema }),
        system:
          "You tag portfolio projects for a senior video editor. Pick the single best category id, 3-5 short lowercase keyword tags, " +
          "a hex accent colour matching the mood, and credit badges: filmed (shot on camera by them — false for AI-generated work), " +
          "directed, edited.",
        prompt: [
          `Categories: ${CATEGORY_IDS.join(", ")}`,
          `Title: ${input.title}`,
          `Client: ${input.client}`,
          `Role: ${input.role}`,
          `Tools: ${input.tools.join(", ")}`,
          `Description: ${input.description}`,
        ].join("\n"),
      });
      const res: AnalyzeResponse = { ok: true, source: "ai", suggestion: sanitize(output as Suggestion, fallback) };
      return Response.json(res);
    } catch {
      const res: AnalyzeResponse = {
        ok: true,
        source: "heuristic",
        note: "AI request failed — showing keyword-based suggestions instead",
        suggestion: fallback,
      };
      return Response.json(res);
    }
  } catch (err) {
    return errorResponse(err);
  }
}
