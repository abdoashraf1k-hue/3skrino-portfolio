import { analyticsConfigured, analyticsReport } from "@/lib/admin/analytics";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { lastBackupDate } from "@/lib/admin/backups";
import { latestDeployment, type DeployStatus } from "@/lib/admin/github";
import { adminLog, type LogEntry } from "@/lib/admin/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type DashboardResponse = {
  deploy: DeployStatus | null;
  activity: LogEntry[];
  lastBackup: string | null;
  /** Page views per day (30, oldest → today) when Vercel Analytics is configured. */
  views: number[] | null;
  totalViews: number | null;
};

/** GET → health + activity for the Dashboard tab. Each part fails soft. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const [deploy, activity, lastBackup, report] = await Promise.all([
    latestDeployment().catch(() => null),
    adminLog(5).catch(() => []),
    lastBackupDate().catch(() => null),
    analyticsConfigured() ? analyticsReport(30).catch(() => null) : Promise.resolve(null),
  ]);
  const body: DashboardResponse = {
    deploy,
    activity,
    lastBackup,
    views: report ? report.series.map((p) => p.pageviews) : null,
    totalViews: report ? report.totals.pageviews : null,
  };
  return Response.json(body);
}
