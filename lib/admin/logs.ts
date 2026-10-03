import { BACKUP_TARGETS, listBackups, snapshotChanges, type BackupTarget } from "./backups";
import { commitFiles, getCommit, getFileAt, getHead, GitHubError, listCommits, type CommitSummary, type FileChange } from "./github";
import { ProjectsFileError } from "./projects-file";

/** Commits the admin made (saves, restores, backups, reverts). */
const ADMIN_PREFIX = /^(admin|restore|backup|revert):/i;
export const isAdminCommit = (c: CommitSummary) => ADMIN_PREFIX.test(c.message);

export type LogEntry = CommitSummary & { kind: "admin" | "restore" | "backup" | "revert" };

export async function adminLog(limit = 40): Promise<LogEntry[]> {
  const out: LogEntry[] = [];
  // Admin commits are interleaved with code pushes — scan up to 3 pages.
  for (let page = 1; page <= 3 && out.length < limit; page++) {
    const commits = await listCommits(100, page);
    for (const c of commits) {
      if (!isAdminCommit(c)) continue;
      const kind = c.message.split(":")[0].toLowerCase() as LogEntry["kind"];
      out.push({ ...c, kind });
      if (out.length >= limit) break;
    }
    if (commits.length < 100) break;
  }
  return out;
}

const TARGET_BY_PATH = Object.fromEntries(Object.entries(BACKUP_TARGETS).map(([t, p]) => [p, t as BackupTarget])) as Record<
  string,
  BackupTarget
>;

/**
 * Undo one admin commit: put every data file it touched back to its parent
 * version. Refused if any of those files changed again afterwards — undoing
 * then would silently discard the later edit (use Backups for that).
 */
export async function revertCommit(sha: string): Promise<{ sha: string; files: string[] }> {
  const commit = await getCommit(sha);
  if (!ADMIN_PREFIX.test(commit.message)) throw new ProjectsFileError("Only admin commits can be undone here", 400);
  if (!commit.parent) throw new ProjectsFileError("That commit has no parent", 400);
  const files = commit.files.map((f) => f.filename).filter((f) => f in TARGET_BY_PATH);
  if (!files.length) throw new ProjectsFileError("That commit didn't change any data file (nothing to undo)", 400);

  for (let attempt = 0; ; attempt++) {
    const head = await getHead();
    const existing = await listBackups();
    const changes: FileChange[] = [];
    for (const file of files) {
      const [atCommit, atHead, atParent] = await Promise.all([getFileAt(file, sha), getFileAt(file, head), getFileAt(file, commit.parent)]);
      if (atCommit !== atHead) {
        throw new ProjectsFileError(`${file} has changed since that commit — restore an older version from Backups instead`, 409);
      }
      changes.push(atParent === null ? { path: file, delete: true } : { path: file, content: atParent });
      if (atHead !== null) changes.push(...(await snapshotChanges(TARGET_BY_PATH[file], atHead, existing)));
    }
    const subject = commit.message.split("\n")[0];
    try {
      const newSha = await commitFiles(head, changes, `revert: ${subject} (${sha.slice(0, 7)})`);
      return { sha: newSha, files };
    } catch (err) {
      const conflict = err instanceof GitHubError && (err.status === 409 || err.status === 422);
      if (!conflict || attempt >= 1) throw err;
    }
  }
}
