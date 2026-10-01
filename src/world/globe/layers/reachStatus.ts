// LANE W6: the "reach" layer's one composite health line -- mirrors
// hazardStatus.ts's shape (this lane's own copy, not imported: that file
// belongs to another lane) but reach has no "loading" branch worth its own
// state, since the app ring is always drawable static data (store.ts, never
// fetched) even before the first live poll lands.
import type { LayerHealth } from "../globeStore.ts";

export interface ReachStatusInput {
  appCount: number;
  ci: { pass: number; total: number } | null;
  /** True only once the signals fetch has actually failed (not merely
   *  "hasn't answered yet") -- named in the sentence rather than silently
   *  dropped, same discipline as hazardStatus.ts's `failed` list. */
  ciDown: boolean;
  nowPlaying: boolean;
  lichessOnline: boolean;
}

export function buildReachStatus(input: ReachStatusInput): LayerHealth {
  const parts = [`${input.appCount} apps on the ring`];
  if (input.ci) parts.push(`CI ${input.ci.pass}/${input.ci.total} passing`);
  else if (input.ciDown) parts.push("CI family unreachable");
  if (input.nowPlaying) parts.push("now playing");
  if (input.lichessOnline) parts.push("lichess online");

  // "live" whenever at least one live sub-feed is actually reaching this
  // layer; "snapshot" when only the static app ring has anything to show
  // (never "failed" -- the app ring itself never fails, it's committed data).
  const state: LayerHealth["state"] = input.ci || input.nowPlaying || input.lichessOnline ? "live" : "snapshot";
  return { state, detail: parts.join("; ") };
}
