import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DEFAULT_HERO_CONFIG } from "@/data/hero-defaults";
import { analyticsConfigured } from "@/lib/admin/analytics";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { writeHero } from "@/lib/admin/hero-file";
import { ProjectsFileError, errorResponse, readJson } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SettingsStatus = {
  github: boolean;
  blob: boolean;
  analytics: boolean;
  /** VERCEL_TOKEN + VERCEL_PROJECT_ID: key rotation can update the env var itself. */
  vercelApi: boolean;
  deployHook: boolean;
  cronSecret: boolean;
  /** Sprint 10 — shown on admin → Integrations. */
  resend: boolean;
  googleAnalytics: boolean;
  aiGateway: boolean;
  blobCallback: boolean;
  siteUrl: boolean;
};

function status(): SettingsStatus {
  const env = process.env;
  return {
    github: Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO),
    blob: Boolean(env.BLOB_READ_WRITE_TOKEN),
    analytics: analyticsConfigured(),
    vercelApi: Boolean(env.VERCEL_TOKEN && env.VERCEL_PROJECT_ID),
    deployHook: Boolean(env.VERCEL_DEPLOY_HOOK_URL),
    cronSecret: Boolean(env.CRON_SECRET),
    resend: Boolean(env.RESEND_API_KEY),
    googleAnalytics: Boolean(env.NEXT_PUBLIC_GA_ID),
    aiGateway: Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN),
    blobCallback: Boolean(env.VERCEL_BLOB_CALLBACK_URL),
    siteUrl: Boolean(env.NEXT_PUBLIC_SITE_URL),
  };
}

async function upsertAdminKey(value: string): Promise<void> {
  const url = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID ?? "")}/env`);
  url.searchParams.set("upsert", "true");
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key: "ADMIN_SECRET_KEY", value, type: "encrypted", target: ["production", "preview"] }),
    cache: "no-store",
  });
  if (!res.ok) throw new ProjectsFileError(`Vercel refused the env update (${res.status})`, 502);
}

/** GET → SettingsStatus (which integrations are configured — never their values). */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  return Response.json(status());
}

/**
 * POST { action: "revalidate" } → purge the cached pages
 * POST { action: "reset-hero" } → data/hero-config.ts back to factory settings (backed up first)
 * POST { action: "rotate-key" } → { key, applied, redeploying } — a fresh ADMIN_SECRET_KEY;
 *   applied to the Vercel project when the API is configured, else shown for manual setup.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { action } = await readJson(request);
    if (action === "revalidate") {
      revalidatePath("/", "layout");
      return Response.json({ ok: true });
    }
    if (action === "reset-hero") {
      return Response.json({ ok: true, ...(await writeHero(DEFAULT_HERO_CONFIG, "admin: reset hero to factory settings")) });
    }
    if (action === "rotate-key") {
      const key = randomBytes(24).toString("base64url");
      const s = status();
      if (!s.vercelApi) return Response.json({ ok: true, key, applied: false, redeploying: false });
      await upsertAdminKey(key);
      let redeploying = false;
      if (process.env.VERCEL_DEPLOY_HOOK_URL) {
        redeploying = (await fetch(process.env.VERCEL_DEPLOY_HOOK_URL, { method: "POST", cache: "no-store" })).ok;
      }
      return Response.json({ ok: true, key, applied: true, redeploying });
    }
    throw new ProjectsFileError("Unknown action");
  } catch (err) {
    return errorResponse(err);
  }
}
