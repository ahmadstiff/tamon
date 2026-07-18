const API = "https://api.github.com";

function headers(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "tamon",
  };
}

/// Split "owner/name" into URL-encoded path segments.
///
/// The contract already rejects anything that isn't exactly one slash with non-traversal
/// segments, so this cannot be handed `a/../../b`. Encoding each segment separately is a second
/// layer: even if the on-chain validation were ever loosened, a crafted repo string still
/// couldn't escape into a different API path.
function segments(repo: string): [string, string] {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`malformed repo: ${repo}`);
  return [encodeURIComponent(parts[0]), encodeURIComponent(parts[1])];
}

interface CommitListItem {
  sha: string;
  author: {login?: string} | null;
}

/// Count commits by `author` on the default branch since `since`, excluding empty ones.
///
/// The empty-commit check is what keeps the target meaningful. `git commit --allow-empty` in a
/// loop satisfies any commit count in about two seconds, so without inspecting the diff this
/// measures nothing at all. It costs one extra API call per commit, which is acceptable at the
/// scale a commitment target implies.
///
/// `since` filters on committer date, which is client-settable — someone determined can re-date
/// existing work. Combined with the non-empty check this is a reasonable objectivity proxy, not
/// a proof of work, and the README says so.
export async function countCommits(
  repo: string,
  author: string,
  since: Date,
  target: number,
): Promise<{achieved: number; headSha: string | null}> {
  const [owner, name] = segments(repo);
  const url =
    `${API}/repos/${owner}/${name}/commits` +
    `?author=${encodeURIComponent(author)}` +
    `&since=${since.toISOString()}` +
    `&per_page=100`;

  const res = await fetch(url, {headers: headers()});
  if (res.status === 404) throw new Error("repository not found or not public");
  if (res.status === 403) throw new Error("github rate limit reached, retry shortly");
  if (!res.ok) throw new Error(`github commits failed: ${res.status}`);

  const list = (await res.json()) as CommitListItem[];

  let achieved = 0;
  let headSha: string | null = null;

  for (const item of list) {
    if (item.author?.login?.toLowerCase() !== author.toLowerCase()) continue;
    if (!(await isNonEmpty(owner, name, item.sha))) continue;
    achieved++;
    headSha ??= item.sha;
    // Stop once the target is met — no reason to spend rate limit proving a bigger number.
    if (achieved >= target) break;
  }

  return {achieved, headSha};
}

async function isNonEmpty(owner: string, name: string, sha: string): Promise<boolean> {
  const res = await fetch(`${API}/repos/${owner}/${name}/commits/${sha}`, {headers: headers()});
  if (!res.ok) return false;
  const detail = (await res.json()) as {stats?: {total?: number}};
  return (detail.stats?.total ?? 0) > 0;
}

/// Confirm the repository is owned by the OAuth-bound account. Without this, a user could
/// commit against a busy repository they have nothing to do with and settle on its activity.
export function ownsRepo(repo: string, githubLogin: string): boolean {
  const owner = repo.split("/")[0];
  return owner?.toLowerCase() === githubLogin.toLowerCase();
}
