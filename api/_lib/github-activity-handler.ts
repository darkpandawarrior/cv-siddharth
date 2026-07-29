declare const process: { env: Record<string, string | undefined> };

const GITHUB_USER = "darkpandawarrior";

export type GithubActivityItem = { repo: string; type: "push" | "pr" | "create"; message: string; url: string; at: string };
export type GithubActivity = { connected: boolean; items: GithubActivityItem[] };

interface RawEvent {
  type: string;
  repo: { name: string };
  created_at: string;
  payload: Record<string, unknown>;
}

function normalize(e: RawEvent): GithubActivityItem | null {
  const url = `https://github.com/${e.repo.name}`;
  if (e.type === "PushEvent") {
    const commits = (e.payload.commits as { message: string }[] | undefined) ?? [];
    return { repo: e.repo.name, type: "push", message: commits[0]?.message ?? "pushed", url, at: e.created_at };
  }
  if (e.type === "PullRequestEvent") {
    const pr = e.payload.pull_request as { title: string } | undefined;
    return { repo: e.repo.name, type: "pr", message: pr?.title ?? "opened a PR", url, at: e.created_at };
  }
  if (e.type === "CreateEvent") {
    const refType = e.payload.ref_type as string | undefined;
    return { repo: e.repo.name, type: "create", message: `created ${refType ?? "ref"}`, url, at: e.created_at };
  }
  return null;
}

export async function getGithubActivity(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubActivity> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetchImpl(`https://api.github.com/users/${GITHUB_USER}/events/public`, { headers });
  if (!res.ok) return { connected: false, items: [] };
  const events = (await res.json()) as RawEvent[];
  const items = events.map(normalize).filter((i): i is GithubActivityItem => i !== null).slice(0, 5);
  return { connected: true, items };
}

export async function handleGithubActivity(request: Request): Promise<Response> {
  void request;
  const activity = await getGithubActivity(process.env);
  return new Response(JSON.stringify(activity), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "s-maxage=15, stale-while-revalidate=60",
    },
  });
}
