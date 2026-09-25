// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as weather-handler.ts.
import { guarded } from "./guard.js";

declare const process: { env: Record<string, string | undefined> };

const OWNER = "darkpandawarrior";
const TIMEOUT_MS = 4000;
// No email or other personal identifier in any header — same rule as
// weather-handler.ts, github-activity-handler.ts, ops-handler.ts.
const USER_AGENT = "siddharth-pandalai.vercel.app portfolio";

export type CiState = "pass" | "fail" | "none";
export type CiRepoSlug = "doori" | "gaddi" | "paymentslab-kmp" | "kmp-toolkit" | "kmp-build-logic";
export type DownloadRepoSlug = "doori" | "gaddi" | "paymentslab-kmp";
export type CiEntry = { state: CiState; newestAt: string | null; failing: string[] };
export type DownloadEntry = { tag: string; apk: number };

export type SignalsResponse = {
  at: string;
  lichess: { online: boolean; playing: boolean } | null;
  devto: { url: string; reactions: number; comments: number; publishedAt: string }[] | null;
  ci: Record<CiRepoSlug, CiEntry> | null;
  downloads: Record<DownloadRepoSlug, DownloadEntry> | null;
};

/** Display slug -> the GitHub repo name (case matters for the API path). This
 *  is the only family-CI source in the plan (M18) — ops-handler.ts keeps
 *  polling cv-siddharth's own runs only. */
const CI_REPOS: { slug: CiRepoSlug; repo: string }[] = [
  { slug: "doori", repo: "Doori" },
  { slug: "gaddi", repo: "Gaddi" },
  { slug: "paymentslab-kmp", repo: "PaymentsLab-KMP" },
  { slug: "kmp-toolkit", repo: "kmp-toolkit" },
  { slug: "kmp-build-logic", repo: "kmp-build-logic" },
];
const DOWNLOAD_REPOS: { slug: DownloadRepoSlug; repo: string }[] = [
  { slug: "doori", repo: "Doori" },
  { slug: "gaddi", repo: "Gaddi" },
  { slug: "paymentslab-kmp", repo: "PaymentsLab-KMP" },
];

/**
 * One upstream fetch, `null` on anything that isn't a clean 200 — a rejected
 * fetch (timeout, DNS, network), a non-ok status (so a 403/429 degrades this
 * one part rather than throwing), or a body that doesn't parse as JSON. No
 * retry: same one-shot contract as weather-handler.ts's fetchJson.
 */
async function fetchJson<T>(url: string, fetchImpl: typeof fetch, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface LichessStatus {
  online?: boolean;
  playing?: boolean;
}

async function getLichess(fetchImpl: typeof fetch): Promise<{ online: boolean; playing: boolean } | null> {
  // `current-game`, not this, would read the last FINISHED game as live —
  // rejected in live-data-spec.md §1.3 for exactly that reason.
  const data = await fetchJson<LichessStatus[]>(`https://lichess.org/api/users/status?ids=${OWNER}`, fetchImpl);
  const entry = data?.[0];
  if (!entry) return null;
  return { online: !!entry.online, playing: !!entry.playing };
}

interface DevtoArticle {
  url: string;
  public_reactions_count: number;
  comments_count: number;
  published_at: string;
}

async function getDevto(fetchImpl: typeof fetch): Promise<SignalsResponse["devto"]> {
  // Only url/reactions/comments/publishedAt are kept (live-data-spec §1.1) —
  // the Forem API's article body and tags never leave this handler.
  const data = await fetchJson<DevtoArticle[]>(`https://dev.to/api/articles?username=${OWNER}&per_page=100`, fetchImpl);
  if (!data) return null;
  return data.map((a) => ({ url: a.url, reactions: a.public_reactions_count, comments: a.comments_count, publishedAt: a.published_at }));
}

interface GhRun {
  name: string;
  conclusion: string | null;
  run_started_at: string;
  head_branch: string;
}

/**
 * The newest completed run of every workflow on `main`, same grouping
 * ops-handler.ts's getOps uses. `branch=main` is already in the request URL,
 * but the fixture-driven acceptance (a newer failing chore/* run alongside a
 * green main run) is filtered here too, defensively, rather than trusted to
 * the query string alone.
 */
async function getRepoCi(repo: string, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<CiEntry | null> {
  const data = await fetchJson<{ workflow_runs?: GhRun[] }>(
    `https://api.github.com/repos/${OWNER}/${repo}/actions/runs?branch=main&status=completed&per_page=30`,
    fetchImpl,
    headers,
  );
  if (!data) return null;

  const runs = (data.workflow_runs ?? []).filter((r) => r.head_branch === "main");
  if (runs.length === 0) return { state: "none", newestAt: null, failing: [] };

  const newestPerWorkflow = new Map<string, GhRun>();
  for (const r of runs) {
    const existing = newestPerWorkflow.get(r.name);
    if (!existing || Date.parse(r.run_started_at) > Date.parse(existing.run_started_at)) newestPerWorkflow.set(r.name, r);
  }
  const newest = [...newestPerWorkflow.values()];
  const failing = newest.filter((r) => r.conclusion !== "success" && r.conclusion !== "skipped").map((r) => r.name);
  const newestAt = newest.reduce<string | null>(
    (max, r) => (!max || Date.parse(r.run_started_at) > Date.parse(max) ? r.run_started_at : max),
    null,
  );
  return { state: failing.length > 0 ? "fail" : "pass", newestAt, failing };
}

interface GhReleaseAsset {
  name: string;
  download_count: number;
}
interface GhRelease {
  tag_name: string;
  assets?: GhReleaseAsset[];
}

/** Sums `download_count` over assets ending `.apk`, skipping `.sha256`,
 *  `.gif` and `.zip` (live-data-spec §1.3). */
async function getRepoDownloads(repo: string, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<DownloadEntry | null> {
  const data = await fetchJson<GhRelease[]>(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=1`, fetchImpl, headers);
  const release = data?.[0];
  if (!release) return null;
  const apk = (release.assets ?? []).filter((a) => a.name.endsWith(".apk")).reduce((sum, a) => sum + a.download_count, 0);
  return { tag: release.tag_name, apk };
}

/** `repos`' results assemble into one record only when every one of them
 *  came back non-null — one GitHub 403 degrades the whole `ci` (or
 *  `downloads`) block to null rather than a record with holes the response
 *  type doesn't have room to express. */
function assembleOrNull<S extends string, V>(
  repos: { slug: S; repo: string }[],
  results: PromiseSettledResult<V | null>[],
): Record<S, V> | null {
  const out = {} as Record<S, V>;
  for (let i = 0; i < repos.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || r.value === null) return null;
    out[repos[i].slug] = r.value;
  }
  return out;
}

/**
 * Same shape as weather-handler.ts / github-activity-handler.ts: never
 * throws, an upstream that is down, slow or 403s degrades its own part to
 * `null` rather than ever failing the request. Exactly 10 fetches per call
 * (1 lichess + 1 dev.to + 5 Actions + 3 Releases), always — no retry, so a
 * 403 costs the same one call as a 200.
 */
export async function getSignals(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<SignalsResponse> {
  const ghHeaders: Record<string, string> = { accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) ghHeaders.authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const results = await Promise.allSettled([
    getLichess(fetchImpl),
    getDevto(fetchImpl),
    ...CI_REPOS.map((r) => getRepoCi(r.repo, ghHeaders, fetchImpl)),
    ...DOWNLOAD_REPOS.map((r) => getRepoDownloads(r.repo, ghHeaders, fetchImpl)),
  ]);

  const lichess = results[0].status === "fulfilled" ? results[0].value : null;
  const devto = results[1].status === "fulfilled" ? results[1].value : null;
  const ciResults = results.slice(2, 2 + CI_REPOS.length) as PromiseSettledResult<CiEntry | null>[];
  const downloadResults = results.slice(2 + CI_REPOS.length) as PromiseSettledResult<DownloadEntry | null>[];

  return {
    at: new Date().toISOString(),
    lichess,
    devto,
    ci: assembleOrNull(CI_REPOS, ciResults),
    downloads: assembleOrNull(DOWNLOAD_REPOS, downloadResults),
  };
}

async function signalsHandler(_request: Request): Promise<Response> {
  const body = await getSignals(process.env);
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=0, s-maxage=120, stale-while-revalidate=600",
    },
  });
}

/** Carries env.GITHUB_TOKEN (D2) — same guard as ops-handler.ts, see there. */
export const handleSignals = guarded("signals", signalsHandler);
