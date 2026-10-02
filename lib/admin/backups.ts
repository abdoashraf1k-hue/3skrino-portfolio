import { commitFiles, getFileAt, getHead, GitHubError, listDir, type FileChange } from "./github";
import { parseProjectsFile, PROJECTS_PATH, ProjectsFileError } from "./projects-file";

/**
 * Timestamped snapshots of data/projects.ts under backups/. Every admin write
 * snapshots the version it is about to replace — in the SAME commit as the
 * change, so a save never triggers two deploys — and prunes to the newest 30.
 */

export const BACKUP_DIR = "backups";
export const KEEP_BACKUPS = 30;
const NAME = /^projects-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.ts$/;

export type Backup = { path: string; name: string; size: number; createdAt: string };

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function toBackup(f: { name: string; path: string; size: number }): Backup | null {
  const m = NAME.exec(f.name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return { ...f, createdAt: `${y}-${mo}-${d}T${h}:${mi}:${s}Z` };
}

function assertBackupPath(path: string): void {
  const [dir, name, ...rest] = path.split("/");
  if (dir !== BACKUP_DIR || rest.length || !name || !NAME.test(name)) {
    throw new ProjectsFileError("Not a backup path", 400);
  }
}

/** Newest first. */
export async function listBackups(): Promise<Backup[]> {
  const files = await listDir(BACKUP_DIR);
  return files
    .map(toBackup)
    .filter((b): b is Backup => b !== null)
    .sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Changes to fold into the next commit: one new snapshot of `content`, plus
 * deletes for anything beyond the newest KEEP_BACKUPS (counting the new one).
 */
export async function snapshotChanges(content: string): Promise<FileChange[]> {
  const existing = await listBackups();
  const path = `${BACKUP_DIR}/projects-${stamp()}.ts`;
  const stale = existing.filter((b) => b.path !== path).slice(KEEP_BACKUPS - 1);
  return [{ path, content }, ...stale.map((b) => ({ path: b.path, delete: true as const }))];
}

export async function readBackup(path: string): Promise<string> {
  assertBackupPath(path);
  const content = await getFileAt(path, await getHead());
  if (content === null) throw new ProjectsFileError("Backup not found", 404);
  return content;
}

/** Writes a backup over data/projects.ts (snapshotting the current file first). */
export async function restoreBackup(path: string): Promise<void> {
  const content = await readBackup(path);
  parseProjectsFile(content); // refuse to restore anything the site couldn't load
  for (let attempt = 0; ; attempt++) {
    const head = await getHead();
    const current = await getFileAt(PROJECTS_PATH, head);
    try {
      await commitFiles(
        head,
        [{ path: PROJECTS_PATH, content }, ...(current ? await snapshotChanges(current) : [])],
        `restore: from ${path}`,
      );
      return;
    } catch (err) {
      const conflict = err instanceof GitHubError && (err.status === 409 || err.status === 422);
      if (!conflict || attempt >= 1) throw err;
    }
  }
}

/** Deletes everything past the newest KEEP_BACKUPS. Returns how many went. */
export async function pruneOldBackups(): Promise<number> {
  const stale = (await listBackups()).slice(KEEP_BACKUPS);
  if (!stale.length) return 0;
  await commitFiles(
    await getHead(),
    stale.map((b) => ({ path: b.path, delete: true as const })),
    `backup: prune ${stale.length} old snapshot${stale.length === 1 ? "" : "s"}`,
  );
  return stale.length;
}
