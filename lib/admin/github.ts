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
  const res = await fetch(`${contentsUrl(repo, path)}?ref=${encodeURIComponent(branch)}`, {
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

/** Commits `content` to `path` on the configured branch. Returns the new blob sha. */
export async function putFile(path: string, content: string, message: string, sha: string): Promise<string> {
  const { token, repo, branch, name, email } = config();
  const res = await fetch(contentsUrl(repo, path), {
    method: "PUT",
    headers: headers(token),
    cache: "no-store",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      branch,
      ...(email ? { committer: { name, email } } : {}),
    }),
  });
  if (!res.ok) await fail(res, "write");

  const data = (await res.json()) as { content?: { sha?: unknown } };
  return typeof data.content?.sha === "string" ? data.content.sha : "";
}
