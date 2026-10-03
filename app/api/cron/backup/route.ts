import type { BackupSchedule } from "@/data/site-config";
import { lastBackupDate, pruneOldBackups, snapshotAll } from "@/lib/admin/backups";
import { readSite } from "@/lib/admin/site-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How old the newest snapshot may be before a scheduled run takes a new one. */
const MAX_AGE_HOURS: Record<Exclude<BackupSchedule, "off">, number> = { daily: 20, weekly: 6.5 * 24, monthly: 29 * 24 };

/**
 * Vercel Cron (vercel.json → daily). Vercel sends `Authorization: Bearer
 * $CRON_SECRET`; without CRON_SECRET configured the route refuses to run, so
 * it can never be triggered publicly. The schedule itself (off / daily /
 * weekly / monthly) is read from data/site-config.ts at run time.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { config } = await readSite();
    const schedule = config.backups.schedule;
    if (schedule === "off") return Response.json({ ok: true, skipped: "schedule is off" });
    const last = await lastBackupDate();
    const ageHours = last ? (Date.now() - Date.parse(last)) / 3_600_000 : Infinity;
    if (ageHours < MAX_AGE_HOURS[schedule]) {
      return Response.json({ ok: true, skipped: `last backup ${Math.round(ageHours)}h ago (${schedule})` });
    }
    const res = await snapshotAll(`scheduled ${schedule} snapshot`);
    const pruned = await pruneOldBackups().catch(() => 0);
    return Response.json({ ok: true, ...res, pruned });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Backup failed" }, { status: 500 });
  }
}
