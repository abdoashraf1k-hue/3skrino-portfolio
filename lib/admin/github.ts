/**
 * Thin wrapper over the GitHub Contents API. Server-only (imported by route
 * handlers alone): reads the token from process.env and never logs it or the
 * file contents.
 */

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

function config() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) throw new GitHubError("GitHub is not configured on the server", 500);
  return {
    token,
    repo,
    branch,
    name: process.env.GITHUB_NAME || "3SKRINO Admin",
    email: process.env.GITHUB_EMAIL || "",
  };
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

const TIMEOUT_MS = 10_000;

/**
 * fetch with a hard 10s ceiling. GitHub occasionally stalls; without this a
 * request hangs until the platform kills the function. A timeout surfaces as
 * a 504 GitHubError the admin can show and retry.
 */
async function ghFetch(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    // Buffer the body inside the same window — a stall mid-body must time out too.
    const body = res.status === 204 || res.status === 304 ? null : await res.arrayBuffer();
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch (err) {
    if (ctrl.signal.aborted) throw new GitHubError("GitHub timed out — retry", 504);
    throw new GitHubError(`Couldn't reach GitHub${err instanceof Error ? `: ${err.message}` : ""}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

function contentsUrl(repo: string, path: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${repo}/contents/${encoded}`;
}

/** Status only — GitHub's error bodies are safe, but we keep responses terse. */
async function fail(res: Response, action: string): Promise<never> {
  let detail = "";
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string") detail = `: ${body.message}`;
  } catch {
    // Non-JSON error body — status is enough.
  }
  throw new GitHubError(`GitHub ${action} failed (${res.status})${detail}`, res.status);
}

export async function getFile(path: string): Promise<{ content: string; sha: string }> {
  const { token, repo, branch } = config();
  const res = await ghFetch(`${contentsUrl(repo, path)}?ref=${encodeURIComponent(branch)}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) await fail(res, "read");

  const data = (await res.json()) as { content?: unknown; sha?: unknown; encoding?: unknown };
  if (typeof data.content !== "string" || typeof data.sha !== "string") {
    throw new GitHubError("GitHub read returned an unexpected shape", 502);
  }
  return { content: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

/* ------------------------------------------------------------------ */
/* Git Data API — several files (writes + deletes) in ONE commit        */
/* ------------------------------------------------------------------ */

async function gh<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { token, repo } = config();
  const res = await ghFetch(`${API}/repos/${repo}/${path}`, {
    method,
    headers: headers(token),
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) await fail(res, method === "GET" ? "read" : "write");
  return (await res.json()) as T;
}

/** The branch head right now — pass it to commitFiles for optimistic concurrency. */
export async function getHead(): Promise<string> {
  const { branch } = config();
  const ref = await gh<{ object: { sha: string } }>("GET", `git/ref/heads/${encodeURIComponent(branch)}`);
  return ref.object.sha;
}

/** Reads a file as of a specific commit (so reads and the later write agree on the base). */
export async function getFileAt(path: string, commitSha: string): Promise<string | null> {
  const { token, repo } = config();
  const res = await ghFetch(`${contentsUrl(repo, path)}?ref=${commitSha}`, { headers: headers(token), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) await fail(res, "read");
  const data = (await res.json()) as { content?: unknown };
  if (typeof data.content !== "string") throw new GitHubError("GitHub read returned an unexpected shape", 502);
  return Buffer.from(data.content, "base64").toString("utf8");
}

export type FileChange = { path: string; content: string } | { path: string; delete: true };

/**
 * Commits every change on top of `parentSha` and fast-forwards the branch.
 * If someone else pushed meanwhile the ref update is rejected (422) — callers
 * re-read and retry.
 */
export async function commitFiles(parentSha: string, changes: FileChange[], message: string): Promise<string> {
  const { branch, name, email } = config();
  const parent = await gh<{ tree: { sha: string } }>("GET", `git/commits/${parentSha}`);
  const tree = await gh<{ sha: string }>("POST", "git/trees", {
    base_tree: parent.tree.sha,
    tree: changes.map((c) =>
      "delete" in c
        ? { path: c.path, mode: "100644", type: "blob", sha: null }
        : { path: c.path, mode: "100644", type: "blob", content: c.content },
    ),
  });
  const commit = await gh<{ sha: string }>("POST", "git/commits", {
    message,
    tree: tree.sha,
    parents: [parentSha],
    ...(email ? { author: { name, email }, committer: { name, email } } : {}),
  });
  await gh("PATCH", `git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha, force: false });
  return commit.sha;
}

/** Lists a directory at the branch head. Missing directory → []. */
export async function listDir(path: string): Promise<{ name: string; path: string; size: number }[]> {
  const { token, repo, branch } = config();
  const res = await ghFetch(`${contentsUrl(repo, path)}?ref=${encodeURIComponent(branch)}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) await fail(res, "read");
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .filter((f): f is { type: string; name: string; path: string; size: number } => typeof f === "object" && f !== null)
    .filter((f) => f.type === "file")
    .map((f) => ({ name: f.name, path: f.path, size: f.size }));
}

/** Date of the latest commit touching `path` (ISO) — "last edit" in the dashboard. */
export async function lastCommitDate(path: string): Promise<string | null> {
  const { branch } = config();
  const commits = await gh<{ commit: { committer: { date: string } } }[]>(
    "GET",
    `commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}&per_page=1`,
  );
  return commits[0]?.commit.committer.date ?? null;
}

/* ------------------------------------------------------------------ */
/* History — the admin's Logs tab and the dashboard's activity feed     */
/* ------------------------------------------------------------------ */

export type CommitSummary = { sha: string; message: string; author: string; date: string; url: string };

type RawCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null; committer: { date: string } | null };
  author: { login: string } | null;
};

const summarize = (c: RawCommit): CommitSummary => ({
  sha: c.sha,
  message: c.commit.message,
  author: c.commit.author?.name ?? c.author?.login ?? "unknown",
  date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
  url: c.html_url,
});

/** Newest first on the configured branch. */
export async function listCommits(perPage = 50, page = 1): Promise<CommitSummary[]> {
  const { branch } = config();
  const commits = await gh<RawCommit[]>(
    "GET",
    `commits?sha=${encodeURIComponent(branch)}&per_page=${Math.min(100, perPage)}&page=${page}`,
  );
  return commits.map(summarize);
}

export type CommitFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** Unified diff hunk text (absent for binary / huge files). */
  patch?: string;
};

export async function getCommit(sha: string): Promise<CommitSummary & { parent: string | null; files: CommitFile[] }> {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new GitHubError("Not a commit sha", 400);
  const c = await gh<RawCommit & { parents: { sha: string }[]; files?: CommitFile[] }>("GET", `commits/${sha}`);
  return {
    ...summarize(c),
    parent: c.parents[0]?.sha ?? null,
    files: (c.files ?? []).map(({ filename, status, additions, deletions, patch }) => ({ filename, status, additions, deletions, patch })),
  };
}

export type DeployStatus = {
  state: "success" | "failure" | "error" | "pending" | "in_progress" | "queued" | "inactive" | "unknown";
  environment: string;
  sha: string;
  createdAt: string;
  url: string | null;
};

/**
 * The newest deployment the Vercel GitHub integration recorded, with its
 * latest status — build health without a Vercel token.
 */
export async function latestDeployment(): Promise<DeployStatus | null> {
  const deployments = await gh<{ id: number; sha: string; environment: string; created_at: string }[]>(
    "GET",
    "deployments?per_page=5",
  );
  const d = deployments.find((x) => /production/i.test(x.environment)) ?? deployments[0];
  if (!d) return null;
  const statuses = await gh<{ state: DeployStatus["state"]; environment_url?: string; target_url?: string }[]>(
    "GET",
    `deployments/${d.id}/statuses?per_page=1`,
  );
  const s = statuses[0];
  return {
    state: s?.state ?? "unknown",
    environment: d.environment,
    sha: d.sha,
    createdAt: d.created_at,
    url: s?.environment_url || s?.target_url || null,
  };
}
