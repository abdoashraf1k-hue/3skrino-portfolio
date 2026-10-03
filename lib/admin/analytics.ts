/**
 * Vercel Web Analytics query API (server-only). Needs VERCEL_TOKEN (a Vercel
 * access token) and VERCEL_PROJECT_ID; VERCEL_TEAM_ID for team-owned projects.
 * https://vercel.com/docs/analytics/web-analytics-api
 */

const API = "https://api.vercel.com/v1/query/web-analytics";

export type Row = Record<string, string | number>;
export type AnalyticsRange = 7 | 30 | 90;

export type AnalyticsReport = {
  configured: true;
  range: AnalyticsRange;
  totals: { pageviews: number; visitors: number };
  /** One point per day, oldest → today. */
  series: { date: string; pageviews: number; visitors: number }[];
  topPages: { label: string; value: number }[];
  topProjects: { label: string; value: number }[];
  devices: { label: string; value: number }[];
  referrers: { label: string; value: number }[];
  countries: { label: string; value: number }[];
  events: { label: string; value: number }[];
};

export type AnalyticsUnavailable = { configured: false; reason: string };

export function analyticsConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);
}

async function query(dataset: "visits" | "events", params: Record<string, string>): Promise<Row[]> {
  const url = new URL(`${API}/${dataset}/aggregate`);
  url.searchParams.set("projectId", process.env.VERCEL_PROJECT_ID ?? "");
  if (process.env.VERCEL_TEAM_ID) url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Vercel Analytics ${dataset} query failed (${res.status})`);
    const body = (await res.json()) as { data?: unknown };
    return Array.isArray(body.data) ? (body.data as Row[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const ranked = (rows: Row[], dim: string, metric: string) =>
  rows
    .map((r) => ({ label: String(r[dim] ?? "—") || "(direct)", value: n(r[metric]) }))
    .sort((a, b) => b.value - a.value);

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function analyticsReport(range: AnalyticsRange): Promise<AnalyticsReport> {
  const until = new Date();
  const since = new Date(until.getTime() - (range - 1) * 86_400_000);
  const window = { since: day(since), until: day(until) };

  const [series, pages, devices, referrers, countries, projects, events] = await Promise.all([
    query("visits", { ...window, by: "day" }),
    query("visits", { ...window, by: "requestPath", limit: "10" }),
    query("visits", { ...window, by: "deviceType", limit: "5" }),
    query("visits", { ...window, by: "referrerHostname", limit: "8" }),
    query("visits", { ...window, by: "country", limit: "8" }),
    query("events", { ...window, by: "eventData/project_id", limit: "10", filter: "eventName eq 'project_view'" }).catch(() => []),
    query("events", { ...window, by: "eventName", limit: "10" }).catch(() => []),
  ]);

  // Fill gaps so the chart has one point per day.
  const byDate = new Map(series.map((r) => [String(r.timestamp).slice(0, 10), r]));
  const points: AnalyticsReport["series"] = [];
  for (let t = since.getTime(); t <= until.getTime() + 1; t += 86_400_000) {
    const date = day(new Date(t));
    const r = byDate.get(date);
    points.push({ date, pageviews: n(r?.pageviews), visitors: n(r?.visitors) });
  }

  return {
    configured: true,
    range,
    totals: {
      pageviews: points.reduce((a, p) => a + p.pageviews, 0),
      visitors: points.reduce((a, p) => a + p.visitors, 0),
    },
    series: points,
    topPages: ranked(pages, "requestPath", "pageviews"),
    topProjects: ranked(projects, "eventData", "count"),
    devices: ranked(devices, "deviceType", "pageviews"),
    referrers: ranked(referrers, "referrerHostname", "pageviews"),
    countries: ranked(countries, "country", "pageviews"),
    events: ranked(events, "eventName", "count"),
  };
}
