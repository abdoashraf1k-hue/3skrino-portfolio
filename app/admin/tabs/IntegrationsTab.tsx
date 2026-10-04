"use client";

import { useEffect, useState } from "react";
import type { SettingsStatus } from "@/app/api/admin/settings/route";
import { card, micro, Section, Stat, TabHeader } from "@/components/admin/ui";
import { AuthError, adminFetch } from "@/lib/admin/client-api";

type Integration = { key: keyof SettingsStatus; name: string; env: string; powers: string; without: string; required?: boolean };

const GROUPS: { title: string; items: Integration[] }[] = [
  {
    title: "Core",
    items: [
      { key: "github", name: "GitHub", env: "GITHUB_TOKEN · GITHUB_REPO · GITHUB_BRANCH", powers: "every save, backups, logs, activity, undo", without: "the admin can't save anything", required: true },
      { key: "blob", name: "Vercel Blob", env: "BLOB_READ_WRITE_TOKEN", powers: "video, image, pose, logo and sound uploads · Media Library", without: "no uploads; the Media Library is empty", required: true },
      { key: "siteUrl", name: "Site URL", env: "NEXT_PUBLIC_SITE_URL", powers: "canonical links, sitemap, share images", without: "SEO falls back to the default domain" },
    ],
  },
  {
    title: "Insight",
    items: [
      { key: "analytics", name: "Vercel Web Analytics API", env: "VERCEL_TOKEN · VERCEL_PROJECT_ID (· VERCEL_TEAM_ID)", powers: "the Analytics tab and dashboard views", without: "Analytics shows setup steps instead of charts" },
      { key: "googleAnalytics", name: "Google Analytics", env: "NEXT_PUBLIC_GA_ID", powers: "GA4 tracking on the public site", without: "only Vercel Analytics records visits" },
    ],
  },
  {
    title: "Automation",
    items: [
      { key: "cronSecret", name: "Cron secret", env: "CRON_SECRET", powers: "scheduled backups (admin → Backups)", without: "the backup schedule never runs" },
      { key: "deployHook", name: "Deploy hook", env: "VERCEL_DEPLOY_HOOK_URL", powers: "redeploy after a key rotation", without: "redeploy by hand after rotating the key" },
      { key: "vercelApi", name: "Vercel API", env: "VERCEL_TOKEN · VERCEL_PROJECT_ID", powers: "one-click admin key rotation", without: "set the new key in Vercel yourself" },
      { key: "blobCallback", name: "Blob upload callback", env: "VERCEL_BLOB_CALLBACK_URL", powers: "upload-completed webhooks in production", without: "uploads still work; no webhook" },
    ],
  },
  {
    title: "Messaging & AI",
    items: [
      { key: "resend", name: "Resend", env: "RESEND_API_KEY", powers: "the contact form's email", without: "the contact form can't send" },
      { key: "aiGateway", name: "AI Gateway", env: "AI_GATEWAY_API_KEY (or Vercel OIDC)", powers: "AI video analysis in the project editor (title, tags, category)", without: "the ✦ Analyse button is unavailable" },
    ],
  },
];

type Props = { adminKey: string; onAuthError: () => void };

/** What the site is connected to — read from the server's environment (values are never sent to the browser). */
export default function IntegrationsTab({ adminKey, onAuthError }: Props) {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    let alive = true;
    adminFetch<SettingsStatus>(adminKey, "settings", "GET").then(
      (s) => alive && setStatus(s),
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof AuthError) onAuthError();
        else setFailed(err instanceof Error ? err.message : "Couldn't read the server's settings");
      },
    );
    return () => {
      alive = false;
    };
  }, [adminKey, onAuthError]);

  const all = GROUPS.flatMap((g) => g.items);
  const on = status ? all.filter((i) => status[i.key]).length : 0;
  const missingRequired = status ? all.filter((i) => i.required && !status[i.key]) : [];

  return (
    <div>
      <TabHeader title="Integrations" hint="services the site and admin talk to · set in Vercel → Project → Settings → Environment Variables, then redeploy" />
      <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-3">
        <Stat label="Connected" value={status ? `${on} / ${all.length}` : "—"} tone={status ? (missingRequired.length ? "bad" : "ok") : undefined} />
        <Stat label="Required missing" value={status ? missingRequired.length : "—"} tone={status ? (missingRequired.length ? "bad" : "ok") : undefined} sub={missingRequired.map((m) => m.name).join(", ") || "all set"} />
        <Stat label="Values shown here" value="never" sub="only on / off" />
      </div>
      {failed && <p className="mb-6 text-sm text-[#ff6b6b]">{failed}</p>}
      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {g.items.map((i) => {
              const ok = status?.[i.key];
              return (
                <li key={i.key} className={`${card} flex flex-col gap-2 p-3`}>
                  <span className="flex items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${status === null ? "bg-white/20" : ok ? "bg-[#3dffb0]" : i.required ? "bg-[#ff2d2d]" : "bg-[#ffb54d]"}`} />
                    <span className="text-sm font-bold">{i.name}</span>
                    {i.required && <span className={`${micro} text-[8px] text-white/35`}>required</span>}
                    <span className={`${micro} ml-auto text-[9px] ${ok ? "text-[#3dffb0]" : "text-white/40"}`}>{status === null ? "…" : ok ? "connected" : "not set"}</span>
                  </span>
                  <span className="text-xs text-white/60">Powers: {i.powers}</span>
                  {status !== null && !ok && <span className="text-xs text-[#ffb54d]/80">Without it: {i.without}</span>}
                  <span className="font-mono text-[10px] text-white/30">{i.env}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
    </div>
  );
}
