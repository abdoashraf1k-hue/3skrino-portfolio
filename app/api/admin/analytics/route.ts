import { analyticsConfigured, analyticsReport, type AnalyticsRange } from "@/lib/admin/analytics";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?range=7|30|90 → AnalyticsReport | { configured: false, reason } */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  if (!analyticsConfigured()) {
    return Response.json({
      configured: false,
      reason: "Set VERCEL_TOKEN and VERCEL_PROJECT_ID (plus VERCEL_TEAM_ID for a team project) in the Vercel project's environment variables.",
    });
  }
  const r = Number(new URL(request.url).searchParams.get("range"));
  const range: AnalyticsRange = r === 7 || r === 90 ? r : 30;
  try {
    return Response.json(await analyticsReport(range));
  } catch (err) {
    return Response.json({ configured: false, reason: err instanceof Error ? err.message : "Analytics query failed" }, { status: 502 });
  }
}
