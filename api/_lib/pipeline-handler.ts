declare const process: { env: Record<string, string | undefined> };

const OWNER = "darkpandawarrior";

/** The signing certificate every published APK must carry. Pinned in each app's
 *  F-Droid metadata as AllowedAPKSigningKeys, and shown here so a reader can run
 *  `apksigner verify --print-certs` on a downloaded APK and compare it themselves.
 *  A supply chain you can check beats a badge you cannot. */
export const SIGNING_FINGERPRINT =
  "e3cd9ed25baaa6db5501621a2a7399edc0878022f9b64b5d95446db0348dd19c";

/** Only apps that actually ship from the F-Droid repo. Adding one here without a
 *  live listing would make this panel claim something untrue. */
const APPS: Record<string, { repo: string; pkg: string }> = {
  kursi: { repo: "Kursi", pkg: "com.kursi.android" },
  mileway: { repo: "Mileway", pkg: "com.mileway" },
  paymentslab: { repo: "PaymentsLab", pkg: "com.paymentslab.app" },
};

export type PipelineRun = {
  name: string;
  conclusion: string;
  /** Seconds. Null when the run is still going. */
  durationSec: number | null;
  at: string;
  url: string;
};

export type Pipeline = {
  connected: boolean;
  repo: string;
  runs: PipelineRun[];
  release: { tag: string; publishedAt: string; url: string } | null;
  /** From the live F-Droid index, not from the repo. This is the number that
   *  proves the pipeline reached users rather than merely going green. */
  published: { versionName: string; sizeBytes: number; antiFeatures: string[] } | null;
  fingerprint: string;
};

const EMPTY = (repo: string): Pipeline => ({
  connected: false,
  repo,
  runs: [],
  release: null,
  published: null,
  fingerprint: SIGNING_FINGERPRINT,
});

function seconds(startedAt: string, updatedAt: string): number | null {
  const a = Date.parse(startedAt);
  const b = Date.parse(updatedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 1000);
}

export async function getPipeline(
  slug: string,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<Pipeline> {
  const app = APPS[slug];
  if (!app) return EMPTY(slug);

  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const base = `https://api.github.com/repos/${OWNER}/${app.repo}`;

  // Each source is independent: a rate-limited GitHub must not blank out the
  // F-Droid figures, which come from a static file and never rate-limit.
  const [runsRes, relRes, idxRes] = await Promise.allSettled([
    fetchImpl(`${base}/actions/runs?per_page=8&status=completed`, { headers }),
    fetchImpl(`${base}/releases/latest`, { headers }),
    fetchImpl("https://darkpandawarrior.github.io/fdroid/repo/index-v2.json"),
  ]);

  const out = EMPTY(app.repo);

  if (runsRes.status === "fulfilled" && runsRes.value.ok) {
    const data = (await runsRes.value.json()) as {
      workflow_runs?: {
        name: string; conclusion: string | null; run_started_at: string;
        updated_at: string; html_url: string;
      }[];
    };
    out.runs = (data.workflow_runs ?? []).slice(0, 6).map((r) => ({
      name: r.name,
      conclusion: r.conclusion ?? "running",
      durationSec: seconds(r.run_started_at, r.updated_at),
      at: r.run_started_at,
      url: r.html_url,
    }));
    out.connected = true;
  }

  if (relRes.status === "fulfilled" && relRes.value.ok) {
    const r = (await relRes.value.json()) as { tag_name: string; published_at: string; html_url: string };
    out.release = { tag: r.tag_name, publishedAt: r.published_at, url: r.html_url };
  }

  if (idxRes.status === "fulfilled" && idxRes.value.ok) {
    const idx = (await idxRes.value.json()) as {
      packages?: Record<string, { versions?: Record<string, {
        file?: { size?: number };
        manifest?: { versionName?: string };
        antiFeatures?: Record<string, unknown>;
      }> }>;
    };
    const versions = idx.packages?.[app.pkg]?.versions;
    const first = versions ? Object.values(versions)[0] : undefined;
    if (first) {
      out.published = {
        versionName: first.manifest?.versionName ?? "unknown",
        sizeBytes: first.file?.size ?? 0,
        antiFeatures: Object.keys(first.antiFeatures ?? {}),
      };
    }
  }

  return out;
}

export async function handlePipeline(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const pipeline = await getPipeline(slug, process.env);
  return new Response(JSON.stringify(pipeline), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // A pipeline panel does not need to be to-the-second, and caching keeps
      // the unauthenticated GitHub rate limit off the critical path.
      "cache-control": "s-maxage=120, stale-while-revalidate=600",
    },
  });
}
