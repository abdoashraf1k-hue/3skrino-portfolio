"use client";

import { useState } from "react";
import { btn, btnPrimary, card, input, micro } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/client-api";

type Step = { step: string; ok: boolean; detail: string };
type TestResult = { ok: boolean; source: "form" | "env"; bucket: string; endpointHost: string; steps: Step[]; probeUrl?: string; probeText?: string };

const DEFAULTS = { endpoint: "https://t3.storage.dev", region: "auto" };

/**
 * Sprint 15.5 — admin → Settings → Storage → Tigris. Paste the keys from the
 * Tigris console, test them, apply the CORS rule, then copy the env block
 * into Vercel. Keys live in this component's state only: sent over HTTPS to
 * the admin API (admin key required) for one request, never saved, never in
 * the repo. Leave the form empty to test what's already deployed.
 */
export default function TigrisConnect({ adminKey, active, onError }: { adminKey: string; active: { host: string; bucket: string; endpoint: string } | null; onError: (m: string) => void }) {
  const [form, setForm] = useState({ endpoint: DEFAULTS.endpoint, region: DEFAULTS.region, accessKeyId: "", secretAccessKey: "", bucket: "" });
  const [busy, setBusy] = useState<"test" | "cors" | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [browserCheck, setBrowserCheck] = useState<Step | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const filled = Boolean(form.accessKeyId.trim() || form.secretAccessKey.trim() || form.bucket.trim());
  const credentials = filled ? form : undefined;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const test = async () => {
    setBusy("test");
    setResult(null);
    setBrowserCheck(null);
    setNote(null);
    try {
      const res = await adminFetch<TestResult>(adminKey, "storage", "POST", { action: "test", credentials });
      setResult(res);
      // The real-world check: can THIS page read from the bucket cross-origin (what /media + the hologram do)?
      if (res.probeUrl) {
        try {
          const r = await fetch(res.probeUrl, { mode: "cors", cache: "no-store" });
          const text = await r.text();
          const ok = r.ok && text === res.probeText;
          setBrowserCheck({ step: "Browser read (CORS)", ok, detail: ok ? `${location.origin} can read the bucket` : `HTTP ${r.status}` });
        } catch {
          setBrowserCheck({ step: "Browser read (CORS)", ok: false, detail: `${location.origin} is blocked by CORS — click “Apply CORS”, then test again` });
        }
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setBusy(null);
    }
  };

  const cors = async () => {
    setBusy("cors");
    setNote(null);
    try {
      const res = await adminFetch<{ ok: true; origins: string[] }>(adminKey, "storage", "POST", { action: "cors", credentials });
      setNote(`CORS applied: GET / HEAD / PUT from ${res.origins.join(", ")} · ETag exposed. Test again to confirm.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't apply CORS");
    } finally {
      setBusy(null);
    }
  };

  const envBlock = [
    `TIGRIS_ENDPOINT=${form.endpoint.trim() || DEFAULTS.endpoint}`,
    `TIGRIS_REGION=${form.region.trim() || DEFAULTS.region}`,
    `TIGRIS_ACCESS_KEY_ID=${form.accessKeyId.trim()}`,
    `TIGRIS_SECRET_ACCESS_KEY=${form.secretAccessKey.trim()}`,
    `TIGRIS_BUCKET_NAME=${form.bucket.trim()}`,
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(envBlock);
      setNote("Copied — paste it into Vercel → Settings → Environment Variables (it accepts a pasted .env block), then redeploy.");
    } catch {
      onError("Couldn't copy — select the fields manually");
    }
  };

  const steps = [...(result?.steps ?? []), ...(browserCheck ? [browserCheck] : [])];

  return (
    <div className={`${card} p-4`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <p className="text-sm font-bold">Tigris — media bucket</p>
          <p className={`${micro} text-[9px] text-white/40`}>
            {active?.host === "tigris"
              ? `Live: ${active.bucket} on ${active.endpoint} — /media, uploads and the AI engine use it`
              : active?.host === "b2"
                ? "Live: Backblaze B2 (fallback). Set the TIGRIS_* variables on Vercel to switch — stored URLs don't change."
                : "No bucket configured — paste your Tigris keys, test, then add them to Vercel"}
          </p>
        </div>
        <a href="https://console.storage.dev" target="_blank" rel="noreferrer" className={btn}>
          Tigris console ↗
        </a>
      </div>

      <form
        className="grid gap-2 sm:grid-cols-2"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void test();
        }}
      >
        <label className={`${micro} flex flex-col gap-1 text-white/50`}>
          Endpoint
          <input className={input} value={form.endpoint} onChange={set("endpoint")} placeholder={DEFAULTS.endpoint} spellCheck={false} />
        </label>
        <label className={`${micro} flex flex-col gap-1 text-white/50`}>
          Region
          <input className={input} value={form.region} onChange={set("region")} placeholder="auto" spellCheck={false} />
        </label>
        <label className={`${micro} flex flex-col gap-1 text-white/50`}>
          Access key ID
          <input className={input} value={form.accessKeyId} onChange={set("accessKeyId")} placeholder="tid_…" spellCheck={false} autoComplete="off" />
        </label>
        <label className={`${micro} flex flex-col gap-1 text-white/50`}>
          Secret access key
          <input className={input} type="password" value={form.secretAccessKey} onChange={set("secretAccessKey")} placeholder="tsec_…" autoComplete="new-password" />
        </label>
        <label className={`${micro} flex flex-col gap-1 text-white/50 sm:col-span-2`}>
          Bucket name
          <input className={input} value={form.bucket} onChange={set("bucket")} placeholder="e.g. 3skrino-media" spellCheck={false} />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" className={btnPrimary} disabled={busy !== null}>
            {busy === "test" ? "Testing…" : filled ? "Test connection" : "Test deployed keys"}
          </button>
          <button type="button" className={btn} disabled={busy !== null || (!filled && active?.host !== "tigris")} onClick={() => void cors()}>
            {busy === "cors" ? "Applying…" : "Apply CORS"}
          </button>
          <button type="button" className={btn} disabled={!form.accessKeyId.trim() || !form.secretAccessKey.trim() || !form.bucket.trim()} onClick={() => void copy()}>
            Copy env block
          </button>
          <span className={`${micro} text-[9px] text-white/35`}>keys stay in this page — never saved or committed</span>
        </div>
      </form>

      {steps.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-white/10 pt-3" role="status">
          {steps.map((s) => (
            <li key={s.step} className="flex items-baseline gap-2 text-sm">
              <span className={s.ok ? "text-[#3dffb0]" : "text-[#ff6b6b]"}>{s.ok ? "✓" : "✕"}</span>
              <span className="w-36 shrink-0 text-white/80">{s.step}</span>
              <span className="text-white/55">{s.detail}</span>
            </li>
          ))}
          {result && (
            <li className={`${micro} mt-1 text-[9px] text-white/35`}>
              tested {result.source === "form" ? "the keys in the form" : "the deployed TIGRIS_* variables"} · bucket {result.bucket} · {result.endpointHost}
            </li>
          )}
        </ul>
      )}
      {note && <p className={`${micro} mt-2 text-[#e7fe55]`}>{note}</p>}
    </div>
  );
}
