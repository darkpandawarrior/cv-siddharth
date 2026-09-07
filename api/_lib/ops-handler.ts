import { guarded } from "./guard.js";

declare const process: { env: Record<string, string | undefined> };

const OWNER = "darkpandawarrior";

/**
 * The control tower: the newest completed run of every workflow in the repo
 * that publishes this site.
 *
 * Live rather than generated, because the whole argument of `/ops` is that a
 * board which can only be as fresh as its last build is the failure it is
 * reporting on. One request: the runs feed, grouped by workflow, newest kept.
 *
 * `scheduled` runs matter more here than pushes. The failure this board was
 * built after — a daily refresh red for eight consecutive days while every
 * push stayed green — is invisible if you only look at the last run overall.
 */
const REPO = "cv-siddharth";

/**
 * The two keys, imported rather than restated.
 *
 * This file briefly carried its own copy of the APK fingerprint, which is the
 * duplication every other fix in this repo has been about: two constants that
 * can disagree, on the one page whose subject is claims quietly ceasing to be
 * true. pipeline-handler.ts owns both.
 */
import { SIGNING_FINGERPRINT as APK_FINGERPRINT, INDEX_FINGERPRINT } from "./pipeline-handler.js";

export { APK_FINGERPRINT, INDEX_FINGERPRINT };

const FDROID = "https://darkpandawarrior.github.io/fdroid/repo";

/** The apps that actually publish through that repo. */
const PUBLISHED: { slug: string; repo: string; pkg: string }[] = [
  { slug: "gaddi", repo: "Gaddi", pkg: "com.kursi.android" },
  { slug: "doori", repo: "Doori", pkg: "com.mileway" },
  { slug: "paymentslab-kmp", repo: "PaymentsLab-KMP", pkg: "com.paymentslab.app" },
];

export type PublishedApp = {
  slug: string;
  repo: string;
  pkg: string;
  versionName: string;
  versionCode: number;
  sizeBytes: number;
  /** The published APK's own hash, which is what a reader compares against. */
  sha256: string;
  antiFeatures: string[];
  /** Whether the published APK is signed with the key this site pins. */
  signerMatches: boolean;
  fdroidUrl: string;
  releaseUrl: string;
};

export type SupplyChain = {
  connected: boolean;
  /** When the live index was built — the repo's own claim about itself. */
  indexBuiltAt: string | null;
  apps: PublishedApp[];
};

export type OpsRun = {
  /** The workflow's name, which is the SUBJECT of its row. */
  workflow: string;
  conclusion: string;
  /** ISO timestamp of the run that produced this conclusion. */
  at: string;
  /** The run itself — a row's VERIFIED must link to its evidence. */
  url: string;
  event: string;
  /** How many of the last N runs of this workflow failed. A workflow that is
   *  green now but failed four times this week is not the same as one that has
   *  never failed, and a single conclusion cannot say so. */
  recentFailures: number;
  recentTotal: number;
};

export type Ops = {
  connected: boolean;
  /** True when `runs`/`neverRan` (or `supplyChain`) are last-good cache, not
   *  a live read this request — ops-1: an unauthenticated Actions call burns
   *  its 60/hr limit fast on a shared serverless IP, and the board used to
   *  render CONTROL TOWER and PUBLISHED AND SIGNED fully empty on every one
   *  of those requests instead of holding the last true state. */
  stale: boolean;
  repo: string;
  runs: OpsRun[];
  supplyChain: SupplyChain;
  /** The workflow file list, so a workflow that has NEVER run is still a row
   *  rather than a silent absence — the exact shape of "nobody noticed". */
  neverRan: string[];
};

const EMPTY_CHAIN: SupplyChain = { connected: false, indexBuiltAt: null, apps: [] };
const EMPTY: Ops = { connected: false, stale: false, repo: REPO, runs: [], neverRan: [], supplyChain: EMPTY_CHAIN };

/**
 * The last-good read of each independent source, kept per warm instance.
 *
 * ponytail: module-scope only — it resets on a cold start and is never
 * shared across instances. A KV/edge-cache-backed store would survive both;
 * add one if the board is still going empty after a cold start in practice.
 * Injectable (default param, same shape as chat-handler.ts's rate-limit
 * `store`) so a test can assert the fallback without depending on module
 * state surviving between cases.
 */
export type OpsCacheStore = {
  runs: { runs: OpsRun[]; neverRan: string[] } | null;
  chain: SupplyChain | null;
};
const cache: OpsCacheStore = { runs: null, chain: null };

/**
 * What is actually published right now, from the live F-Droid index.
 *
 * A static file on GitHub Pages, so unlike the Actions API it never
 * rate-limits — getPipeline already leans on that. Independent of the runs
 * fetch on purpose: a throttled GitHub must not blank out the published
 * figures, which are the half a reader can verify without any credentials.
 */
async function getSupplyChain(fetchImpl: typeof fetch): Promise<SupplyChain> {
  let res: Response;
  try {
    res = await fetchImpl(`${FDROID}/index-v2.json`);
  } catch {
    return EMPTY_CHAIN;
  }
  if (!res.ok) return EMPTY_CHAIN;

  const idx = (await res.json()) as {
    repo?: { timestamp?: number };
    packages?: Record<string, {
      versions?: Record<string, {
        file?: { size?: number; sha256?: string };
        manifest?: { versionName?: string; versionCode?: number; signer?: { sha256?: string[] } };
        antiFeatures?: Record<string, unknown>;
      }>;
    }>;
  };

  const apps: PublishedApp[] = [];
  for (const app of PUBLISHED) {
    const versions = idx.packages?.[app.pkg]?.versions;
    const newest = versions ? Object.values(versions)[0] : undefined;
    if (!newest) continue;
    const signer = newest.manifest?.signer?.sha256?.[0] ?? "";
    apps.push({
      slug: app.slug,
      repo: app.repo,
      pkg: app.pkg,
      versionName: newest.manifest?.versionName ?? "unknown",
      versionCode: newest.manifest?.versionCode ?? 0,
      sizeBytes: newest.file?.size ?? 0,
      sha256: newest.file?.sha256 ?? "",
      antiFeatures: Object.keys(newest.antiFeatures ?? {}),
      signerMatches: signer.toLowerCase() === APK_FINGERPRINT,
      fdroidUrl: `${FDROID}/`,
      releaseUrl: `https://github.com/${OWNER}/${app.repo}/releases/latest`,
    });
  }

  return {
    connected: true,
    indexBuiltAt: idx.repo?.timestamp ? new Date(idx.repo.timestamp).toISOString() : null,
    apps,
  };
}

export async function getOps(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  cacheStore: OpsCacheStore = cache,
): Promise<Ops> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const base = `https://api.github.com/repos/${OWNER}/${REPO}`;

  const [runsRes, wfRes, chainRes] = await Promise.allSettled([
    fetchImpl(`${base}/actions/runs?per_page=100&status=completed`, { headers }),
    fetchImpl(`${base}/actions/workflows`, { headers }),
    getSupplyChain(fetchImpl),
  ]);

  const out: Ops = { ...EMPTY, runs: [], neverRan: [], supplyChain: EMPTY_CHAIN };
  let stale = false;

  // The published chain is independent of the runs feed: a rate-limited
  // GitHub must not blank out the figures a reader can check for themselves.
  // A dead F-Droid fetch falls back to this instance's last-good read rather
  // than zeroing the section (ops-1).
  if (chainRes.status === "fulfilled" && chainRes.value.connected) {
    out.supplyChain = chainRes.value;
    cacheStore.chain = chainRes.value;
  } else if (cacheStore.chain) {
    out.supplyChain = cacheStore.chain;
    stale = true;
  }

  if (runsRes.status !== "fulfilled" || !runsRes.value.ok) {
    if (cacheStore.runs) {
      return { ...out, connected: true, stale: true, runs: cacheStore.runs.runs, neverRan: cacheStore.runs.neverRan };
    }
    return { ...out, stale };
  }

  const data = (await runsRes.value.json()) as {
    workflow_runs?: {
      name: string; conclusion: string | null; run_started_at: string;
      html_url: string; event: string;
    }[];
  };
  const all = data.workflow_runs ?? [];

  const byWorkflow = new Map<string, typeof all>();
  for (const r of all) {
    const list = byWorkflow.get(r.name) ?? [];
    list.push(r);
    byWorkflow.set(r.name, list);
  }

  out.runs = [...byWorkflow.entries()]
    .map(([workflow, list]) => {
      const sorted = [...list].sort((a, b) => Date.parse(b.run_started_at) - Date.parse(a.run_started_at));
      const newest = sorted[0];
      return {
        workflow,
        conclusion: newest.conclusion ?? "running",
        at: newest.run_started_at,
        url: newest.html_url,
        event: newest.event,
        recentFailures: sorted.filter((r) => r.conclusion && r.conclusion !== "success" && r.conclusion !== "skipped").length,
        recentTotal: sorted.length,
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  out.connected = true;

  if (wfRes.status === "fulfilled" && wfRes.value.ok) {
    const wf = (await wfRes.value.json()) as { workflows?: { name: string; state: string }[] };
    const ran = new Set(out.runs.map((r) => r.workflow));
    out.neverRan = (wf.workflows ?? [])
      .filter((w) => w.state === "active" && !ran.has(w.name))
      .map((w) => w.name);
  }

  cacheStore.runs = { runs: out.runs, neverRan: out.neverRan };
  out.stale = stale;
  return out;
}

async function opsHandler(_request: Request): Promise<Response> {
  const ops = await getOps(process.env);
  return new Response(JSON.stringify(ops), {
    headers: {
      "content-type": "application/json",
      // Short cache: the board is meant to be current, but a reader reloading
      // it does not need to spend a GitHub rate-limit token every time.
      "cache-control": "public, max-age=0, s-maxage=120, stale-while-revalidate=600",
    },
  });
}

/**
 * This board carries `env.GITHUB_TOKEN` (D2 in the architecture council):
 * unlike /api/chat it had zero origin allowlist and zero rate limiter, so a
 * bare curl loop could burn the owner's 5,000 req/hr GitHub budget and
 * silently degrade every widget that reads it for real visitors. Guarded the
 * same way chat-handler.ts already was, via the shared perimeter in guard.ts.
 */
export const handleOps = guarded("ops", opsHandler);
