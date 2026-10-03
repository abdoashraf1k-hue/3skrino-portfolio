"use client";

import { useEffect, useState } from "react";
import type { SettingsStatus } from "@/app/api/admin/settings/route";
import { btn, btnDanger, card, input, micro, Section, TabHeader } from "@/components/admin/ui";
import type { HeroConfig } from "@/data/hero-config";
import { AuthError, adminFetch, clearStoredKey } from "@/lib/admin/client-api";
import { useConfigStore } from "../store";

const INTEGRATIONS: { key: keyof SettingsStatus; label: string; env: string; what: string }[] = [
  { key: "github", label: "GitHub", env: "GITHUB_TOKEN · GITHUB_REPO", what: "saves, backups, logs" },
  { key: "blob", label: "Vercel Blob", env: "BLOB_READ_WRITE_TOKEN", what: "video + image uploads" },
  { key: "analytics", label: "Web Analytics API", env: "VERCEL_TOKEN · VERCEL_PROJECT_ID", what: "Analytics tab, dashboard views" },
  { key: "vercelApi", label: "Vercel API", env: "VERCEL_TOKEN · VERCEL_PROJECT_ID", what: "one-click key rotation" },
  { key: "deployHook", label: "Deploy hook", env: "VERCEL_DEPLOY_HOOK_URL", what: "redeploy after key rotation" },
  { key: "cronSecret", label: "Cron secret", env: "CRON_SECRET", what: "scheduled backups" },
];

type Rotated = { key: string; applied: boolean; redeploying: boolean };

type Props = { adminKey: string; onAuthError: () => void; onError: (m: string) => void; onSuccess: (m: string) => void };

export default function SettingsTab({ adminKey, onAuthError, onError, onSuccess }: Props) {
  const { adoptHero } = useConfigStore();
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [rotated, setRotated] = useState<Rotated | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    adminFetch<SettingsStatus>(adminKey, "settings", "GET").then(
      (s) => alive && setStatus(s),
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof AuthError) onAuthError();
      },
    );
    return () => {
      alive = false;
    };
  }, [adminKey, onAuthError]);

  const act = async <T,>(action: string, label: string): Promise<T | null> => {
    setBusy(action);
    try {
      return await adminFetch<T>(adminKey, "settings", "POST", { action });
    } catch (err) {
      if (err instanceof AuthError) onAuthError();
      else onError(err instanceof Error ? err.message : `${label} failed`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const rotate = async () => {
    const warning = status?.vercelApi
      ? "Generate a new admin key and write it to the Vercel project?\n\nThe current key keeps working until the next deploy finishes. Copy the new key before leaving this page."
      : "Generate a new admin key?\n\nVercel API access isn't configured, so you'll set it yourself in Project → Settings → Environment Variables.";
    if (!window.confirm(warning)) return;
    const r = await act<Rotated>("rotate-key", "Key rotation");
    if (r) setRotated(r);
  };

  return (
    <div>
      <TabHeader title="Settings" hint="integrations, access and the danger zone" />

      <Section title="Integrations" hint="configured on the server — values are never shown here">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {INTEGRATIONS.map((i) => {
            const on = status?.[i.key];
            return (
              <li key={i.key} className={`${card} flex items-start gap-3 p-3`}>
                <span className={`mt-1 size-2 shrink-0 rounded-full ${status === null ? "bg-white/20" : on ? "bg-[#3dffb0]" : "bg-[#ff2d2d]"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{i.label}</span>
                  <span className={`${micro} block text-[9px] text-white/40`}>{i.what}</span>
                  <span className="mt-1 block font-mono text-[10px] text-white/30">{i.env}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Admin key" hint="the ?key=… secret that opens this panel (ADMIN_SECRET_KEY)">
        <div className={`${card} max-w-3xl p-4`}>
          {!rotated ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-60 flex-1 text-sm text-white/65">
                {status?.vercelApi
                  ? "Rotation writes a fresh key to the Vercel project" + (status.deployHook ? " and starts a deploy." : "; redeploy to make it live.")
                  : "Generates a strong key for you to set in Vercel (Vercel API not configured)."}
              </p>
              <button type="button" className={btn} disabled={busy !== null} onClick={() => void rotate()}>
                {busy === "rotate-key" ? "Generating…" : "Rotate key"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className={`${micro} text-[#e7fe55]`}>New key — copy it now, it isn&apos;t shown again</p>
              <div className="flex gap-2">
                <input readOnly value={rotated.key} className={`${input} font-mono`} onFocus={(e) => e.currentTarget.select()} />
                <button
                  type="button"
                  className={btn}
                  onClick={() => {
                    void navigator.clipboard.writeText(rotated.key).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-white/65">
                {rotated.applied ? (
                  <li>Saved to Vercel as ADMIN_SECRET_KEY (production + preview).</li>
                ) : (
                  <li>Vercel → Project → Settings → Environment Variables → set ADMIN_SECRET_KEY to the key above.</li>
                )}
                <li>{rotated.redeploying ? "A deploy has started — the new key works once it's live." : "Redeploy (Deployments → ⋯ → Redeploy)."}</li>
                <li>
                  Then open <code className="text-[#e7fe55]">/admin?key=NEW_KEY</code>. The old key stops working.
                </li>
              </ol>
            </div>
          )}
        </div>
      </Section>

      <Section title="Team" hint="coming later — single-key access for now">
        <div className={`${card} max-w-3xl p-4 opacity-60`}>
          <ul className="mb-3 flex flex-col gap-1">
            <li className="flex items-center gap-3 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-[#e7fe55] text-xs font-black text-black">3</span>
              3SKRINO <span className={`${micro} text-white/40`}>owner</span>
            </li>
          </ul>
          <div className="flex gap-2">
            <input disabled placeholder="teammate@studio.com" className={input} />
            <button type="button" className={btn} disabled>
              Invite
            </button>
          </div>
          <p className={`${micro} mt-2 text-white/35`}>Per-person logins and roles (editor / viewer) need an auth provider — planned.</p>
        </div>
      </Section>

      <Section title="Danger zone">
        <div className="flex max-w-3xl flex-col gap-2">
          {[
            {
              id: "revalidate",
              label: "Revalidate all pages",
              text: "Purge cached pages so the next visit renders fresh (saves already redeploy — this is for stuck caches).",
              run: async () => {
                if (await act("revalidate", "Revalidate")) onSuccess("Cache purged");
              },
            },
            {
              id: "reset-hero",
              label: "Reset hero config",
              text: "Commit factory hero settings — poses, logos, effects, roles. The current file is backed up first.",
              run: async () => {
                if (!window.confirm("Reset the whole hero to factory settings and commit it? (Backed up first; undo from Logs or Backups.)")) return;
                const r = await act<{ config: HeroConfig }>("reset-hero", "Reset");
                if (r) {
                  adoptHero(r.config);
                  onSuccess("Hero reset — deploying…");
                }
              },
            },
            {
              id: "clear",
              label: "Forget this browser",
              text: "Clear the admin key from this tab and the preview-dock layout, then leave.",
              run: async () => {
                clearStoredKey();
                try {
                  localStorage.removeItem("3skrino-admin-preview");
                } catch {
                  // ignore
                }
                window.location.replace("/");
              },
            },
          ].map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 border border-[#ff2d2d]/20 p-3">
              <span className="min-w-60 flex-1">
                <span className="block text-sm font-bold">{d.label}</span>
                <span className="block text-xs text-white/50">{d.text}</span>
              </span>
              <button type="button" className={btnDanger} disabled={busy !== null} onClick={() => void d.run()}>
                {busy === d.id ? "Working…" : d.label}
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
