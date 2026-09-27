// LANE L7 (live earth events). Pure health-detail composition (task 6): each
// of the six sub-feeds (quakes, EONET, GDACS, the aurora grid, Kp, launches)
// reports independently, and a feed that failed is named rather than
// silently dropped from the sentence. No three, no React.
import type { LayerHealth } from "../globeStore.ts";

export interface FeedResult<T> {
  ok: boolean;
  value: T | null;
}

export interface HazardStatusInput {
  quakes: FeedResult<{ count: number }>;
  eonet: FeedResult<{ fireCount: number; stormCount: number; volcanoCount: number }>;
  gdacs: FeedResult<{ count: number }>;
  aurora: FeedResult<Record<string, never>>;
  kp: FeedResult<{ kp: number }>;
  launches: FeedResult<{ count: number }>;
}

const FEED_NAMES: Record<keyof HazardStatusInput, string> = {
  quakes: "USGS",
  eonet: "EONET",
  gdacs: "GDACS",
  aurora: "aurora",
  kp: "Kp",
  launches: "Launch Library",
};

/** Any feed still `{ ok: false, value: null }` because it hasn't answered
 *  yet (as opposed to having actually failed) is passed with `loading: true`
 *  so the whole layer doesn't read "failed" before the first round-trip. */
export function buildHazardStatus(input: HazardStatusInput, loading: Partial<Record<keyof HazardStatusInput, boolean>> = {}): LayerHealth {
  const clauses: string[] = [];
  const failed: string[] = [];
  let anyOk = false;
  let anyLoading = false;

  for (const key of Object.keys(input) as (keyof HazardStatusInput)[]) {
    const { ok } = input[key];
    if (ok) anyOk = true;
    else if (loading[key]) anyLoading = true;
    else failed.push(`${FEED_NAMES[key]} unreachable`);
  }

  if (input.quakes.ok) clauses.push(`${input.quakes.value!.count} quakes`);
  if (input.eonet.ok) {
    const { fireCount, stormCount, volcanoCount } = input.eonet.value!;
    clauses.push(`${fireCount} fires`, `${stormCount} storms`);
    if (volcanoCount > 0) clauses.push(`${volcanoCount} volcanoes`);
  }
  if (input.gdacs.ok && input.gdacs.value!.count > 0) clauses.push(`${input.gdacs.value!.count} alerts`);
  if (input.kp.ok) clauses.push(`Kp ${input.kp.value!.kp.toFixed(2)}`);
  if (input.launches.ok && input.launches.value!.count > 0) clauses.push(`${input.launches.value!.count} launches`);

  const detail = [...clauses, ...failed].join(", ");

  if (!anyOk && !anyLoading) return { state: "failed", detail: detail || "every feed unreachable" };
  if (!anyOk && anyLoading) return { state: "loading", detail: detail || undefined };
  return { state: "live", detail };
}
