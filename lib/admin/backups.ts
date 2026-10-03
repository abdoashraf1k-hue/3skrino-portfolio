import { commitFiles, getFileAt, getHead, GitHubError, lastCommitDate, listDir, type FileChange } from "./github";
import { ProjectsFileError } from "./projects-file";

/**
 * Timestamped snapshots of the admin-edited data files under backups/. Every
 * admin write snapshots the version it is about to replace — in the SAME
 * commit as the change, so a save never triggers two deploys — and prunes
 * each file's history to the newest KEEP_BACKUPS.
 */

export const BACKUP_DIR = "backups";
export const KEEP_BACKUPS = 30;

/** Every file the admin writes, by backup name prefix. */
export const BACKUP_TARGETS = {
  projects: "data/projects.ts",
  "hero-config": "data/hero-config.ts",
  "site-config": "data/site-config.ts",
} as const;
export type BackupTarget = keyof typeof BACKUP_TARGETS;
const TARGET_NAMES = Object.keys(BACKUP_TARGETS) as BackupTarget[];

const NAME = /^(projects|hero-config|site-config)-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.ts$/;

export type Backup = { path: string; name: string; size: number; createdAt: string; target: BackupTarget; file: string };

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function toBackup(f: { name: string; path: string; size: number }): Backup | null {
  const m = NAME.exec(f.name);
  if (!m) return null;
  const [, target, y, mo, d, h, mi, s] = m;
  const t = target as BackupTarget;
  return { ...f, target: t, file: BACKUP_TARGETS[t], createdAt: `${y}-${mo}-${d}T${h}:${mi}:${s}Z` };
}

function assertBackupPath(path: string): Backup {
  const [dir, name, ...rest] = path.split("/");
  const backup = dir === BACKUP_DIR && !rest.length && name ? toBackup({ name, path, size: 0 }) : null;
  if (!backup) throw new ProjectsFileError("Not a backup path", 400);
  return backup;
}

/** Newest first, every target mixed. */
export async function listBackups(): Promise<Backup[]> {
  const files = await listDir(BACKUP_DIR);
  return files
    .map(toBackup)
    .filter((b): b is Backup => b !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
}

/**
 * Changes to fold into the next commit: one new snapshot of `content`, plus
 * deletes for that target's snapshots beyond the newest KEEP_BACKUPS.
 */
export async function snapshotChanges(target: BackupTarget, content: string, existing?: Backup[]): Promise<FileChange[]> {
  const all = existing ?? (await listBackups());
  const path = `${BACKUP_DIR}/${target}-${stamp()}.ts`;
  const stale = all.filter((b) => b.target === target && b.path !== path).slice(KEEP_BACKUPS - 1);
  return [{ path, content }, ...stale.map((b) => ({ path: b.path, delete: true as const }))];
}

export async function readBackup(path: string): Promise<string> {
  assertBackupPath(path);
  const content = await getFileAt(path, await getHead());
  if (content === null) throw new ProjectsFileError("Backup not found", 404);
  return content;
}

/**
 * Writes a backup over its data file (snapshotting the current file first).
 * `check` must throw if the content couldn't be loaded by the site.
 */
export async function restoreBackup(path: string, check: (target: BackupTarget, content: string) => void): Promise<BackupTarget> {
  const { target, file } = assertBackupPath(path);
  const content = await readBackup(path);
  check(target, content); // refuse to restore anything the site couldn't load
  for (let attempt = 0; ; attempt++) {
    const head = await getHead();
    const current = await getFileAt(file, head);
    try {
      await commitFiles(head, [{ path: file, content }, ...(current ? await snapshotChanges(target, current) : [])], `restore: ${file} from ${path}`);
      return target;
    } catch (err) {
      const conflict = err instanceof GitHubError && (err.status === 409 || err.status === 422);
      if (!conflict || attempt >= 1) throw err;
    }
  }
}

/** One commit snapshotting every data file as it is right now. */
export async function snapshotAll(reason: string): Promise<{ sha: string; files: number }> {
  for (let attempt = 0; ; attempt++) {
    const head = await getHead();
    const existing = await listBackups();
    const changes: FileChange[] = [];
    for (const target of TARGET_NAMES) {
      const content = await getFileAt(BACKUP_TARGETS[target], head);
      if (content !== null) changes.push(...(await snapshotChanges(target, content, existing)));
    }
    try {
      const sha = await commitFiles(head, changes, `backup: ${reason}`);
      return { sha, files: changes.filter((c) => !("delete" in c)).length };
    } catch (err) {
      const conflict = err instanceof GitHubError && (err.status === 409 || err.status === 422);
      if (!conflict || attempt >= 1) throw err;
    }
  }
}

/** Date of the newest snapshot (any target), or null. */
export async function lastBackupDate(): Promise<string | null> {
  const [newest] = await listBackups();
  return newest?.createdAt ?? (await lastCommitDate(BACKUP_DIR).catch(() => null));
}

/** Deletes everything past the newest KEEP_BACKUPS per target. Returns how many went. */
export async function pruneOldBackups(): Promise<number> {
  const all = await listBackups();
  const stale = TARGET_NAMES.flatMap((t) => all.filter((b) => b.target === t).slice(KEEP_BACKUPS));
  if (!stale.length) return 0;
  await commitFiles(
    await getHead(),
    stale.map((b) => ({ path: b.path, delete: true as const })),
    `backup: prune ${stale.length} old snapshot${stale.length === 1 ? "" : "s"}`,
  );
  return stale.length;
}
