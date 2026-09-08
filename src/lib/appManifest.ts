import { useEffect, useState } from "react";
import { ageDays, stateForAge, APP_MANIFEST_SLA_DAYS, type OpsState } from "../data/freshnessSla.ts";

/**
 * The live edge for "which commit is actually running": each embedded `*-app`
 * build ships its own build-manifest.json (scripts/gen-app-manifests.mjs),
 * fetched here at runtime rather than baked in at this repo's build time —
 * the whole point is showing whatever is on the CDN right now, not whatever
 * was true when cv-siddharth last deployed.
 *
 * Same "fetch once and stop" shape as useCorpus.ts: a build manifest changes
 * on a weekly cron at most, so polling it like useLiveSignal's 20s Spotify/
 * GitHub feeds would just re-download a few hundred bytes to learn nothing.
 */
export interface AppManifest {
  repo: string;
  commit: string;
  /** `YYYY-MM-DD` */
  builtAt: string;
  engine: string;
  bytes: number;
}

export async function fetchAppManifest(url: string, fetchImpl: typeof fetch = fetch): Promise<AppManifest> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as AppManifest;
}

/** `/gaddi-app/index.html` -> `/gaddi-app/build-manifest.json`. Named
 *  differently from Kursi's own committed `manifest.json` (its PWA
 *  descriptor) so this never collides with it. */
export const manifestUrlFor = (liveUrl: string): string => liveUrl.replace(/index\.html$/, "build-manifest.json");

export function useAppManifest(liveUrl: string | undefined): {
  manifest: AppManifest | null;
  age: number | null;
  state: OpsState | null;
  error: boolean;
} {
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!liveUrl) return;
    let live = true;
    fetchAppManifest(manifestUrlFor(liveUrl))
      .then((m) => {
        if (live) {
          setManifest(m);
          setError(false);
        }
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [liveUrl]);

  if (!manifest) return { manifest: null, age: null, state: null, error };
  const age = ageDays(manifest.builtAt);
  return { manifest, age, state: stateForAge(age, APP_MANIFEST_SLA_DAYS), error };
}
