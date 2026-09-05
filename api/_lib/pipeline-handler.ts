declare const process: { env: Record<string, string | undefined> };

const OWNER = "darkpandawarrior";

/**
 * The certificate every published APK is signed with.
 *
 * NOT "pinned in each app's F-Droid metadata as AllowedAPKSigningKeys", which
 * is what this comment used to claim. That field is authored in the app repos
 * for an eventual fdroiddata submission, and the publishing repo's own
 * import-metadata.py says in as many words that Binaries, Builds and
 * AllowedAPKSigningKeys "mean nothing to a local repo" — its KEEP list
 * deliberately drops them. Overstating how a signature is enforced, on the one
 * card whose entire authority is precision, is worse than saying less.
 *
 * What IS true and what the card now says: the live index records the signer
 * for every package (`manifest.signer.sha256` and `metadata.preferredSigner`,
 * verified identical to this value for all three), and a reader can confirm it
 * against a download with `apksigner verify --print-certs`. A supply chain you
 * can check beats a badge you cannot.
 */
export const SIGNING_FINGERPRINT =
  "e3cd9ed25baaa6db5501621a2a7399edc0878022f9b64b5d95446db0348dd19c";

/**
 * The key that signs the F-Droid INDEX — deliberately a different key.
 *
 * The APK key lives in each app repo; this one lives with the publishing site.
 * Separating them means compromising the site that announces updates still
 * cannot forge an app update, and it is the fingerprint the repo's README tells
 * a user to verify when they add it. Computed from the signed entry.jar:
 *   unzip -p entry.jar META-INF/INDEX.RSA | openssl pkcs7 -inform DER \
 *     -print_certs | openssl x509 -outform DER | shasum -a 256
 */
export const INDEX_FINGERPRINT =
  "31cfddd6396e2941cc478909f19d19864cae281f671e89edd5ae866b607e1504";

/** Only apps that actually ship from the F-Droid repo. Adding one here without a
 *  live listing would make this panel claim something untrue. */
const APPS: Record<string, { repo: string; pkg: string }> = {
  gaddi: { repo: "Gaddi", pkg: "com.kursi.android" },
  doori: { repo: "Doori", pkg: "com.mileway" },
  "paymentslab-kmp": { repo: "PaymentsLab-KMP", pkg: "com.paymentslab.app" },
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
  /** The index-signing key, which is NOT the APK-signing key. */
  indexFingerprint: string;
};

const EMPTY = (repo: string): Pipeline => ({
  connected: false,
  repo,
  runs: [],
  release: null,
  published: null,
  fingerprint: SIGNING_FINGERPRINT,
  indexFingerprint: INDEX_FINGERPRINT,
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
