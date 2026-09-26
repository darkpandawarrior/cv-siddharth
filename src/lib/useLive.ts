import { useLiveSignal, type LiveSignalSnapshot } from "./useLiveSignal";
import type { SignalsResponse } from "../../api/_lib/signals-handler.ts";

export type { SignalsResponse, CiState, CiRepoSlug, DownloadRepoSlug, CiEntry, DownloadEntry } from "../../api/_lib/signals-handler.ts";

/** live-data-spec.md §1.1: 120 s, matching /api/signals's own s-maxage=120 —
 *  polling faster would just re-serve the edge cache. One shared P4 store
 *  (useLiveSignal), so however many of CiStrip, the keystone lamps, /ops and
 *  /terminal are mounted at once cost one fetch, only while at least one of
 *  them is (the bus tears its timer down at zero subscribers). */
const SIGNALS_INTERVAL_MS = 120_000;

export function useSignals(): LiveSignalSnapshot<SignalsResponse> {
  return useLiveSignal<SignalsResponse>("/api/signals", SIGNALS_INTERVAL_MS);
}
