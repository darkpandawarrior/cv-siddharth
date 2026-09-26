/**
 * The world's ledger: everything he has done, as recorded in `src/data/*`
 * (living-ledger-spec §3.1, "world = f(ledger, now, you)"). This is the
 * ONLY module under src/world/v2 that imports src/data/* — every grammar
 * rule and renderer reads through the `Ledger` object this file builds,
 * never the data files directly (streamFence.test.ts and the `rg` ownership
 * check in this lane's acceptance both hold that line).
 *
 * `anthology.ts` (fiction) is never imported here, so it is excluded from
 * `Ledger` by type, not by convention (living-ledger-spec §3.1).
 */

import {
  experience,
  type Experience,
  openSource,
  type Contribution,
  upstreamMergedPRs,
  upstreamStars,
} from "../../data/profile.ts";
import { projectStats, projectStatsGeneratedAt } from "../../data/projectStats.ts";
import { systemGraph, type SystemGraph } from "../../data/systemGraph.ts";
import { writing, type Writing, writingGeneratedAt } from "../../data/writing.ts";
import { timeline, type Timeline } from "../../data/timeline.ts";
import { chess, type ChessData } from "../../data/chess.ts";
import { weeb } from "../../data/weeb.ts";
import { fleet, delisted, fleetStats, storeGeneratedAt } from "../../data/store.ts";
import { historyMonths, type HistoryMonth, historyGeneratedAt } from "../../data/history.ts";

export type ProjectStats = typeof projectStats;
export type WeebData = typeof weeb;
export type FleetListing = (typeof fleet)[number];
export type DelistedListing = (typeof delisted)[number];
export interface FleetView {
  live: readonly FleetListing[];
  delisted: readonly DelistedListing[];
  stats: typeof fleetStats;
}

export interface Ledger {
  /** Max of every source file's own generatedAt stamp below — never the
   *  current wall-clock time (purity.test.ts, D5). */
  generatedAt: string;
  timeline: Timeline;
  experience: Experience[];
  openSource: Contribution[];
  upstreamMergedPRs: number;
  upstreamStars: string;
  projectStats: ProjectStats;
  systemGraph: SystemGraph;
  writing: Writing;
  chess: ChessData;
  weeb: WeebData;
  fleet: FleetView;
  history: HistoryMonth[];
  /** Fiction is excluded from the ledger by type: nothing can construct a
   *  real value here, so a call site that tries to read anthology data
   *  through the ledger fails to compile rather than silently reading
   *  undefined (living-ledger-spec §3.1, verbatim). */
  anthologyCounts?: never;
}

// Every source's own stamp, in the same order as the fields above — a plain
// max by string comparison (every stamp here is an ISO date or date-time
// prefix, which sorts correctly as a string).
const STAMPS = [
  timeline.generatedAt,
  projectStatsGeneratedAt,
  systemGraph.generatedAt,
  writingGeneratedAt,
  chess.generatedAt,
  weeb.generatedAt,
  storeGeneratedAt,
  historyGeneratedAt,
] as const;

/** The ledger, built once at module load from the committed `src/data/*`
 *  snapshot. Deterministic: no clock, no randomness (purity.test.ts). */
export const ledger: Ledger = {
  generatedAt: STAMPS.reduce((max, s) => (s > max ? s : max)),
  timeline,
  experience: [...experience],
  openSource: [...openSource],
  upstreamMergedPRs,
  upstreamStars,
  projectStats,
  systemGraph,
  writing,
  chess,
  weeb,
  fleet: { live: fleet, delisted, stats: fleetStats },
  history: historyMonths,
};
