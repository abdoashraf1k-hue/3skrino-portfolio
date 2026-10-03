"use client";

import { useEffect, useState } from "react";
import { card, Empty, Loading, micro, Section, Segmented, Stat, TabHeader } from "@/components/admin/ui";
import type { Project } from "@/data/projects";
import type { AnalyticsRange, AnalyticsReport, AnalyticsUnavailable } from "@/lib/admin/analytics";
import { AuthError, adminFetch } from "@/lib/admin/client-api";

type Data = AnalyticsReport | AnalyticsUnavailable;
const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString());

/** Views (filled) + visitors (line), one point per day, with a light grid. */
function LineChart({ series }: { series: AnalyticsReport["series"] }) {
  const W = 800;
  const H = 220;
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...series.map((p) => p.pageviews));
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const x = (i: number) => pad.l + (i / Math.max(1, series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / top) * (H - pad.t - pad.b);
  const path = (k: "pageviews" | "visitors") => series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const labelEvery = Math.ceil(series.length / 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Page views and visitors per day">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="white" strokeOpacity="0.06" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="white" fillOpacity="0.35" fontFamily="monospace">
            {fmt(t)}
          </text>
        </g>
      ))}
      {series.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="white" fillOpacity="0.35" fontFamily="monospace">
            {p.date.slice(5)}
          </text>
        ) : null,
      )}
      <path d={`${path("pageviews")} L${x(series.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`} fill="#e7fe55" fillOpacity="0.08" />
      <path d={path("pageviews")} fill="none" stroke="#e7fe55" strokeWidth="1.6" strokeLinejoin="round" />
      <path d={path("visitors")} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 3" />
    </svg>
  );
}

function Bars({ rows, empty, label }: { rows: { label: string; value: number }[]; empty: string; label: (s: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className={`${micro} py-6 text-white/30`}>{empty}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {rows.slice(0, 8).map((r) => (
        <li key={r.label} className="relative overflow-hidden px-2 py-1.5">
          <span aria-hidden className="absolute inset-y-0 left-0 bg-[#e7fe55]/10" style={{ width: `${(r.value / max) * 100}%` }} />
          <span className="relative flex justify-between gap-3 text-sm">
            <span className="truncate">{label(r.label)}</span>
            <span className="font-mono text-xs tabular-nums text-white/60">{fmt(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const DEVICE_COLORS = ["#e7fe55", "#ffffff", "#ff6a1f", "#5fe3ff", "#9b8cff"];

type Props = { adminKey: string; projects: Project[]; onAuthError: () => void };

export default function AnalyticsTab({ adminKey, projects, onAuthError }: Props) {
  const [range, setRange] = useState<AnalyticsRange>(30);
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    adminFetch<Data>(adminKey, `analytics?range=${range}`, "GET").then(
      (d) => alive && setData(d),
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof AuthError) return onAuthError();
        setData({ configured: false, reason: err instanceof Error ? err.message : "Couldn't load analytics" });
      },
    );
    return () => {
      alive = false;
    };
  }, [adminKey, range, onAuthError]);

  const title = (id: string) => projects.find((p) => p.id === id)?.title ?? id;
  const header = (
    <TabHeader
      title="Analytics"
      hint="Vercel Web Analytics — page views + the project_view / video_play / cta_click events the site sends"
      actions={
        <Segmented<"7" | "30" | "90">
          label="Range"
          value={String(range) as "7" | "30" | "90"}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
          ]}
          onChange={(v) => {
            setData(null);
            setRange(Number(v) as AnalyticsRange);
          }}
        />
      }
    />
  );

  if (!data) return (
    <div>
      {header}
      <Loading what="analytics" />
    </div>
  );

  if (!data.configured) {
    return (
      <div>
        {header}
        <div className={`${card} max-w-2xl p-6`}>
          <p className="mb-3 text-lg font-black uppercase tracking-tight">Connect Vercel Analytics</p>
          <p className="mb-4 text-sm text-white/60">{data.reason}</p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-white/70">
            <li>Vercel → Account Settings → Tokens → create a token (read access is enough).</li>
            <li>
              Project → Settings → Environment Variables: add <code className="text-[#e7fe55]">VERCEL_TOKEN</code> and{" "}
              <code className="text-[#e7fe55]">VERCEL_PROJECT_ID</code> (Settings → General → Project ID). For a team project also{" "}
              <code className="text-[#e7fe55]">VERCEL_TEAM_ID</code>.
            </li>
            <li>Redeploy. Web Analytics must be enabled on the project (it already collects page views).</li>
          </ol>
        </div>
      </div>
    );
  }

  const devTotal = data.devices.reduce((a, d) => a + d.value, 0) || 1;
  const days = data.series.length || 1;

  return (
    <div>
      {header}
      <div className="mb-8 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Page views" value={fmt(data.totals.pageviews)} sub={`${range} days`} />
        <Stat label="Visitors" value={fmt(data.totals.visitors)} sub="unique per day, summed" />
        <Stat label="Views / day" value={fmt(Math.round(data.totals.pageviews / days))} sub="average" />
        <Stat label="Top page" value={<span className="text-base">{data.topPages[0]?.label ?? "—"}</span>} sub={data.topPages[0] ? `${fmt(data.topPages[0].value)} views` : ""} />
      </div>

      <Section title="Traffic" hint="page views (lime) · visitors (dashed)">
        {data.totals.pageviews ? <LineChart series={data.series} /> : <Empty>No traffic in this range yet</Empty>}
      </Section>

      <div className="grid gap-x-8 xl:grid-cols-2">
        <Section title="Top projects" hint="project_view events (card clicks)">
          <Bars rows={data.topProjects} empty="No project views recorded yet" label={title} />
        </Section>
        <Section title="Top pages">
          <Bars rows={data.topPages} empty="No page views yet" label={(s) => s} />
        </Section>
        <Section title="Devices">
          {data.devices.length ? (
            <>
              <div className="mb-3 flex h-3 overflow-hidden rounded-full">
                {data.devices.map((d, i) => (
                  <span key={d.label} style={{ width: `${(d.value / devTotal) * 100}%`, background: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-4">
                {data.devices.map((d, i) => (
                  <li key={d.label} className={`${micro} flex items-center gap-2 text-white/60`}>
                    <span className="size-2 rounded-full" style={{ background: DEVICE_COLORS[i % DEVICE_COLORS.length] }} />
                    {d.label} {Math.round((d.value / devTotal) * 100)}%
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={`${micro} py-6 text-white/30`}>No data</p>
          )}
        </Section>
        <Section title="Referrers">
          <Bars rows={data.referrers} empty="No referrers yet" label={(s) => s} />
        </Section>
        <Section title="Countries">
          <Bars rows={data.countries} empty="No data" label={(s) => s} />
        </Section>
        <Section title="Events">
          <Bars rows={data.events} empty="No custom events yet" label={(s) => s.replace(/_/g, " ")} />
        </Section>
      </div>
    </div>
  );
}
