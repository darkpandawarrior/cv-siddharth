import { guarded } from "./guard.js";
import { governed, type GovernorOptions } from "./upstream.js";

declare const process: { env: Record<string, string | undefined> };

const GITHUB_USER = "darkpandawarrior";

// audit fix (2026-09-28): useLiveSignal's bus fetches at the SMALLEST
// interval any mounted subscriber asks for, and 11 of the 12 callers of
// "/api/github-activity" (SiteFooter, Lanes, Terminal x2, AnomalyRail, Pulse,
// CiStrip, TimeMachine, OpsBoard, Lamps, Hud) use useLiveSignal's default
// 20_000ms — so a page mounting several of them polls this route every 20 s.
// s-maxage=15 meant almost none of that was ever a cache hit: up to
// 4 origin calls/min region-wide against GitHub's unauthenticated 60/hr
// budget. 120 s matches PulseLayer's own POLL_MS neighbourhood and the
// 15-min swr matches streams.ts's slowest cadences (900_000ms) for the
// same class of "recent activity" data — nothing here needs sub-2-minute
// freshness. governed() (aircraft/tle's pattern) adds in-flight coalescing
// and a last-good so concurrent edge isolates during a cold-cache moment
// don't each hit GitHub, plus backoff so a 403/5xx doesn't retry every call.
const GOVERNOR_OPT: GovernorOptions = {
  minIntervalMs: 60_000, // floor under the 120 s edge cache, for coalescing across isolates
  maxStaleMs: 15 * 60_000, // matches the cache-control swr below
  maxBytes: 512 * 1024, // 300 events with full commit/PR payloads can run a few hundred KB
  cooldownMs: 30_000,
  maxCooldownMs: 10 * 60_000,
};

// Negative cache: an error response must not ride the same 120s/900s cache
// as good data — a transient GitHub outage would otherwise show "no
// activity" for up to 15 minutes after recovery. Same shape as the original
// (pre-fix) header, kept short on purpose.
const ERROR_CACHE_CONTROL = "s-maxage=15, stale-while-revalidate=60";
const OK_CACHE_CONTROL = "s-maxage=120, stale-while-revalidate=900";

/** The events endpoint returns up to 300 events over ~90 days; a recent sample
 *  is about 30 across a dozen repos. This was 5, and the only consumer showed
 *  items[0] — so a site whose whole argument is "here is the work" surfaced
 *  exactly one push. 20 is enough for a real week without pretending the
 *  public feed is the whole picture: it is PUBLIC events only, so nothing from
 *  the private Jugnoo and Dice repositories appears here at all. */
const ACTIVITY_LIMIT = 20;

export type GithubActivityItem = {
  repo: string;
  type: "push" | "pr" | "create";
  message: string;
  url: string;
  at: string;
  /** True when the repo belongs to someone else — a contribution OUT, not his
   *  own project. The site had no way to tell them apart, so four upstream
   *  repos he had opened work on were rendered exactly like his own. */
  upstream: boolean;
};
export type GithubActivity = { connected: boolean; items: GithubActivityItem[] };

interface RawEvent {
  type: string;
  repo: { name: string };
  created_at: string;
  payload: Record<string, unknown>;
}

const OWNER = GITHUB_USER.toLowerCase();

function normalize(e: RawEvent): GithubActivityItem | null {
  const url = `https://github.com/${e.repo.name}`;
  const upstream = !e.repo.name.toLowerCase().startsWith(`${OWNER}/`);
  if (e.type === "PushEvent") {
    const commits = (e.payload.commits as { message: string }[] | undefined) ?? [];
    return { repo: e.repo.name, type: "push", message: commits[0]?.message ?? "pushed", url, at: e.created_at, upstream };
  }
  if (e.type === "PullRequestEvent") {
    const pr = e.payload.pull_request as { title: string } | undefined;
    return { repo: e.repo.name, type: "pr", message: pr?.title ?? "opened a PR", url, at: e.created_at, upstream };
  }
  if (e.type === "CreateEvent") {
    const refType = e.payload.ref_type as string | undefined;
    return { repo: e.repo.name, type: "create", message: `created ${refType ?? "ref"}`, url, at: e.created_at, upstream };
  }
  return null;
}

/** Pure parse step for governed() — turns the capped response text into the
 *  filtered/normalized item list, same split as aircraft/tle's buildX(). */
function parseEvents(text: string): GithubActivityItem[] {
  const events = JSON.parse(text) as RawEvent[];
  return events.map(normalize).filter((i): i is GithubActivityItem => i !== null).slice(0, ACTIVITY_LIMIT);
}

export async function getGithubActivity(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubActivity> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const { value } = await governed<GithubActivityItem[]>(
    "github-activity",
    () => fetchImpl(`https://api.github.com/users/${GITHUB_USER}/events/public`, { headers }),
    parseEvents,
    GOVERNOR_OPT,
  );
  if (value === null) return { connected: false, items: [] };
  return { connected: true, items: value };
}

async function githubActivityHandler(_request: Request): Promise<Response> {
  const activity = await getGithubActivity(process.env);
  return new Response(JSON.stringify(activity), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": activity.connected ? OK_CACHE_CONTROL : ERROR_CACHE_CONTROL,
    },
  });
}

/** Carries env.GITHUB_TOKEN (D2) — same guard as ops-handler.ts, see there. */
export const handleGithubActivity = guarded("github-activity", githubActivityHandler);
